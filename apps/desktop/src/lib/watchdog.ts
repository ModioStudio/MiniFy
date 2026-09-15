import { invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "./diagnostics";

const HEARTBEAT_MS = 1000;
/** Anything the page was blocked for longer than this is written down. */
const LONG_TASK_MS = 250;
const LAG_PROBE_MS = 200;
/** A probe this late means the page itself was frozen that long. */
const STALL_REPORT_MS = 1500;
const SLOW_CALL_MS = 2000;
const STUCK_CALL_MS = 5000;
/** The watchdog's own calls; timing them would only log the logging. */
const UNTRACKED = new Set(["log_diagnostic", "renderer_heartbeat"]);

type LongTaskAttribution = {
  containerType?: string;
  containerSrc?: string;
  containerName?: string;
};

type TauriInternals = {
  invoke: (cmd: string, args?: unknown, options?: unknown) => Promise<unknown>;
};

const stallListeners = new Set<(ms: number) => void>();

/** Called with the length of every freeze of this page the watchdog sees. */
export function onRendererStall(listener: (ms: number) => void): () => void {
  stallListeners.add(listener);
  return () => {
    stallListeners.delete(listener);
  };
}

/**
 * Measures freezes from inside the page. A timer that fires late proves the
 * page itself was blocked; the heartbeat alone cannot, because calls backed up
 * on their way into Rust look just as silent from the other side.
 */
function watchEventLoop(): () => void {
  let expected = performance.now() + LAG_PROBE_MS;
  const rearm = () => {
    // A hidden page's timers are throttled; lateness then means nothing.
    expected = performance.now() + LAG_PROBE_MS;
  };

  const timer = window.setInterval(() => {
    const now = performance.now();
    const late = now - expected;
    expected = now + LAG_PROBE_MS;
    if (document.hidden || late < STALL_REPORT_MS) return;

    logDiagnostic("stall", `page was frozen for ${Math.round(late)} ms`);
    for (const listener of stallListeners) listener(late);
  }, LAG_PROBE_MS);
  document.addEventListener("visibilitychange", rearm);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", rearm);
  };
}

/**
 * Times every call into Rust. Slow ones are logged when they finish; while
 * any has been open for seconds, the list of what is waiting is logged once,
 * which shows whether one command holds everything else up.
 */
function watchCalls(): () => void {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  if (!internals) return () => {};

  // Tauri defines invoke read-only. Assigning to it anyway threw inside the
  // shell's effect and blanked the whole window, so only a property that can
  // be replaced gets wrapped; otherwise the call timings are simply missing.
  const descriptor = Object.getOwnPropertyDescriptor(internals, "invoke");
  const replaceable =
    descriptor !== undefined && (descriptor.configurable || descriptor.writable === true);
  if (!replaceable) {
    logDiagnostic("watchdog", "call timing unavailable: Tauri's invoke cannot be wrapped");
    return () => {};
  }

  const original = internals.invoke;
  const inFlight = new Map<number, { cmd: string; at: number }>();
  let nextId = 0;
  let reportedStuck = false;

  const wrapped: TauriInternals["invoke"] = (cmd, args, options) => {
    const id = nextId++;
    const at = performance.now();
    inFlight.set(id, { cmd, at });
    const settle = () => {
      inFlight.delete(id);
      const took = performance.now() - at;
      if (took > SLOW_CALL_MS && !UNTRACKED.has(cmd)) {
        logDiagnostic("ipc", `${cmd} took ${Math.round(took)} ms`);
      }
    };
    const pending = original.call(internals, cmd, args, options);
    pending.then(settle, settle);
    return pending;
  };

  const install = (value: TauriInternals["invoke"]) => {
    if (descriptor.configurable) {
      Object.defineProperty(internals, "invoke", {
        configurable: true,
        enumerable: descriptor.enumerable,
        writable: true,
        value,
      });
    } else {
      internals.invoke = value;
    }
  };
  install(wrapped);

  const check = window.setInterval(() => {
    const now = performance.now();
    const stuck = [...inFlight.values()].filter((call) => now - call.at > STUCK_CALL_MS);
    if (stuck.length === 0) {
      reportedStuck = false;
      return;
    }
    if (reportedStuck) return;
    reportedStuck = true;
    const list = stuck
      .slice(0, 10)
      .map((call) => `${call.cmd} ${Math.round((now - call.at) / 1000)}s`)
      .join(", ");
    logDiagnostic("ipc", `${inFlight.size} calls into Rust open, stuck: ${list}`);
  }, HEARTBEAT_MS);

  return () => {
    window.clearInterval(check);
    install(original);
  };
}

/** Diagnostics must never break the thing they diagnose. */
function safely(start: () => () => void): () => void {
  try {
    return start();
  } catch (error) {
    logDiagnostic("watchdog", `part of the renderer watchdog failed to start: ${String(error)}`);
    return () => {};
  }
}

function watchLongTasks(): () => void {
  const supported = PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false;
  logDiagnostic(
    "watchdog",
    `renderer watchdog on; long-task timing ${supported ? "on" : "unavailable"}`
  );
  if (!supported) return () => {};

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration < LONG_TASK_MS) continue;
      const source = (entry as PerformanceEntry & { attribution?: LongTaskAttribution[] })
        .attribution?.[0];
      const origin = [entry.name, source?.containerType, source?.containerSrc]
        .filter(Boolean)
        .join(" ");
      logDiagnostic("longtask", `${Math.round(entry.duration)} ms blocked (${origin})`);
    }
  });
  observer.observe({ type: "longtask", buffered: true });
  return () => observer.disconnect();
}

/**
 * Evidence for freezes, fed to the watchdog in debug.rs: a heartbeat stamped
 * with when it was sent, a clock inside the page, every slow call into Rust,
 * and every long task with where it ran.
 */
export function startRendererWatchdog(): () => void {
  // One heartbeat in flight at a time, so a slow queue into Rust is measured,
  // not made longer by the watchdog itself.
  let beating = false;
  const beat = () => {
    if (beating) return;
    beating = true;
    invoke("renderer_heartbeat", { visible: !document.hidden, sentAt: Date.now() })
      .catch(() => {})
      .finally(() => {
        beating = false;
      });
  };
  beat();
  const timer = window.setInterval(beat, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", beat);

  const stops = [safely(watchEventLoop), safely(watchCalls), safely(watchLongTasks)];

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", beat);
    for (const stop of stops) stop();
  };
}
