import { logDiagnostic } from "./diagnostics";

/** A failing poll can throw every few seconds; the log needs the first few, not all. */
const MAX_REPORTS_PER_MINUTE = 20;

let windowStart = 0;
let reportsInWindow = 0;

function report(message: string): void {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    reportsInWindow = 0;
  }
  reportsInWindow += 1;
  if (reportsInWindow <= MAX_REPORTS_PER_MINUTE) logDiagnostic("error", message);
}

function describe(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  return typeof reason === "string" ? reason : (JSON.stringify(reason) ?? String(reason));
}

/**
 * Errors outside React's reach (timers, event handlers, promises nobody
 * awaited) go to diagnostics.log too. The webview console is not visible in
 * a release build, so without this they vanish.
 */
export function installCrashReporting(): void {
  window.addEventListener("error", (event) => {
    const at = event.filename ? ` at ${event.filename}:${event.lineno}` : "";
    report(`${describe(event.error ?? event.message)}${at}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    report(`unhandled rejection: ${describe(event.reason)}`);
  });
}
