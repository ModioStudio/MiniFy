import { getActiveProviderType } from "../../providers";
import { getDevices, getPlayerState, transferPlayback } from "../../ui/spotifyClient";
import { logDiagnostic } from "../diagnostics";
import { getSpotifyWebPlaybackStatus } from "../spotifyWebPlayback";
import { getSpotifyWebPlaybackDeviceId } from "../spotifyWebPlaybackDevice";

/**
 * Keeps a Spotify Connect target alive so the transport controls always have
 * somewhere to send commands.
 *
 * It deliberately does *not* chase the active device around. The previous
 * version transferred playback to `devices.find(type === "Computer") ?? devices[0]`
 * whenever it disliked the current state, which meant it could yank playback
 * off MiniFy — or off a speaker the user had just picked — in the background.
 * Now it only steps in when Spotify reports no active device at all.
 */

interface KeepAliveState {
  enabled: boolean;
  /** Device the user (or the SDK) last chose. Never overridden automatically. */
  preferredDeviceId: string | null;
  lastSuccessfulPing: number;
  consecutiveFailures: number;
}

const state: KeepAliveState = {
  enabled: true,
  preferredDeviceId: null,
  lastSuccessfulPing: Date.now(),
  consecutiveFailures: 0,
};

const PING_INTERVAL_MS = 120_000;
const TRANSFER_SETTLE_MS = 1500;
/**
 * The Web Playback SDK takes a few seconds to register MiniFy's own device.
 * Pinging before then finds "no active device", grabs whatever unrelated
 * speaker is listed first, and the user's music starts playing in the wrong
 * room. Give the local device a head start.
 */
const FIRST_PING_DELAY_MS = 12_000;

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let firstPingTimer: ReturnType<typeof setTimeout> | null = null;

/** Records the device the user picked, so recovery returns to it. */
export function setPreferredSpotifyDevice(deviceId: string | null): void {
  state.preferredDeviceId = deviceId;
}

export function getPreferredSpotifyDevice(): string | null {
  return state.preferredDeviceId ?? getSpotifyWebPlaybackDeviceId();
}

export function setKeepAliveEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (enabled) {
    startKeepAlive();
  } else {
    stopKeepAlive();
  }
}

export function isKeepAliveEnabled(): boolean {
  return state.enabled;
}

export function startKeepAlive(): void {
  if (keepAliveInterval) return;

  keepAliveInterval = setInterval(() => {
    void performKeepAlivePing();
  }, PING_INTERVAL_MS);

  firstPingTimer = setTimeout(() => {
    firstPingTimer = null;
    void performKeepAlivePing();
  }, FIRST_PING_DELAY_MS);
}

export function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (firstPingTimer) {
    clearTimeout(firstPingTimer);
    firstPingTimer = null;
  }
}

async function performKeepAlivePing(): Promise<void> {
  if (!state.enabled) return;
  if ((await getActiveProviderType()) !== "spotify") return;

  const playback = getSpotifyWebPlaybackStatus();
  // MiniFy either is the device or is still becoming it; either way there is
  // nothing to recover and adopting some other device would hijack playback.
  if (playback.ready || playback.connecting) return;

  try {
    const playerState = await getPlayerState();
    if (playerState?.device) {
      state.lastSuccessfulPing = Date.now();
      state.consecutiveFailures = 0;
      return;
    }

    // No active device: Spotify has nothing to send commands to, so adopt the
    // preferred one without starting playback.
    await adoptPreferredDevice();
  } catch (error) {
    state.consecutiveFailures += 1;
    logDiagnostic(
      "keepalive",
      `ping failed (${state.consecutiveFailures}): ${error instanceof Error ? error.message : error}`
    );
  }
}

async function adoptPreferredDevice(): Promise<boolean> {
  const devices = await getDevices();
  if (devices.length === 0) return false;

  const preferred = getPreferredSpotifyDevice();
  const target = devices.find((device) => device.id === preferred) ?? devices[0];
  if (!target) return false;

  await transferPlayback(target.id, false);
  await new Promise((resolve) => setTimeout(resolve, TRANSFER_SETTLE_MS));

  state.preferredDeviceId = target.id;
  state.lastSuccessfulPing = Date.now();
  state.consecutiveFailures = 0;
  logDiagnostic("keepalive", `adopted device ${target.name}`);
  return true;
}

/** Returns true when Spotify has a device that can accept player commands. */
export async function ensureActiveDevice(): Promise<boolean> {
  if ((await getActiveProviderType()) !== "spotify") return true;

  try {
    const playerState = await getPlayerState();
    if (playerState?.device) return true;
    return await adoptPreferredDevice();
  } catch (error) {
    logDiagnostic(
      "keepalive",
      `ensureActiveDevice failed: ${error instanceof Error ? error.message : error}`
    );
    return false;
  }
}

export function getKeepAliveStatus(): KeepAliveState {
  return { ...state };
}
