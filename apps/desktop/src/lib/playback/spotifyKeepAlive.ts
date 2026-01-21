import { getActiveProviderType } from "../../providers";
import {
  getDevices,
  getPlayerState,
  play as spotifyPlay,
  transferPlayback,
  type PlayerDevice,
} from "../../ui/spotifyClient";

interface KeepAliveState {
  enabled: boolean;
  lastActiveDeviceId: string | null;
  lastSuccessfulPing: number;
  consecutiveFailures: number;
}

const state: KeepAliveState = {
  enabled: true,
  lastActiveDeviceId: null,
  lastSuccessfulPing: Date.now(),
  consecutiveFailures: 0,
};

const PING_INTERVAL_MS = 120_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const RECOVERY_DELAY_MS = 2000;

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

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

  keepAliveInterval = setInterval(async () => {
    const providerType = await getActiveProviderType();
    if (providerType !== "spotify" || !state.enabled) return;

    await performKeepAlivePing();
  }, PING_INTERVAL_MS);

  performKeepAlivePing();
}

export function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

async function performKeepAlivePing(): Promise<void> {
  try {
    const playerState = await getPlayerState();

    if (playerState?.device) {
      state.lastActiveDeviceId = playerState.device.id;
      state.lastSuccessfulPing = Date.now();
      state.consecutiveFailures = 0;
      return;
    }

    const devices = await getDevices();
    if (devices.length === 0) {
      state.consecutiveFailures++;
      return;
    }

    const activeDevice = devices.find((d) => d.is_active);
    if (activeDevice) {
      state.lastActiveDeviceId = activeDevice.id;
      state.lastSuccessfulPing = Date.now();
      state.consecutiveFailures = 0;
      return;
    }

    state.consecutiveFailures++;

    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      await attemptRecovery(devices);
    }
  } catch (err) {
    state.consecutiveFailures++;
    console.warn("Spotify keep-alive ping failed:", err);

    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      try {
        const devices = await getDevices();
        if (devices.length > 0) {
          await attemptRecovery(devices);
        }
      } catch (recoveryErr) {
        console.error("Spotify recovery failed:", recoveryErr);
      }
    }
  }
}

async function attemptRecovery(devices: PlayerDevice[]): Promise<void> {
  const targetDevice =
    devices.find((d) => d.id === state.lastActiveDeviceId) ??
    devices.find((d) => d.type === "Computer") ??
    devices[0];

  if (!targetDevice) return;

  try {
    await transferPlayback(targetDevice.id, false);
    await new Promise((resolve) => setTimeout(resolve, RECOVERY_DELAY_MS));

    const newState = await getPlayerState();
    if (newState?.device) {
      state.lastActiveDeviceId = newState.device.id;
      state.lastSuccessfulPing = Date.now();
      state.consecutiveFailures = 0;
    }
  } catch (err) {
    console.error("Failed to transfer playback:", err);
  }
}

export async function ensureActiveDevice(): Promise<boolean> {
  const providerType = await getActiveProviderType();
  if (providerType !== "spotify") return true;

  try {
    const playerState = await getPlayerState();
    if (playerState?.device) {
      state.lastActiveDeviceId = playerState.device.id;
      return true;
    }

    const devices = await getDevices();
    if (devices.length === 0) {
      return false;
    }

    const targetDevice =
      devices.find((d) => d.id === state.lastActiveDeviceId) ??
      devices.find((d) => d.type === "Computer") ??
      devices[0];

    if (!targetDevice) return false;

    await transferPlayback(targetDevice.id, false);
    await new Promise((resolve) => setTimeout(resolve, RECOVERY_DELAY_MS));

    state.lastActiveDeviceId = targetDevice.id;
    state.consecutiveFailures = 0;
    return true;
  } catch (err) {
    console.error("Failed to ensure active device:", err);
    return false;
  }
}

export async function recoverAndPlay(): Promise<boolean> {
  const hasDevice = await ensureActiveDevice();
  if (!hasDevice) return false;

  try {
    spotifyPlay();
    return true;
  } catch (err) {
    console.error("Failed to resume playback after recovery:", err);
    return false;
  }
}

export function getKeepAliveStatus(): {
  enabled: boolean;
  lastActiveDeviceId: string | null;
  lastSuccessfulPing: number;
  consecutiveFailures: number;
} {
  return { ...state };
}
