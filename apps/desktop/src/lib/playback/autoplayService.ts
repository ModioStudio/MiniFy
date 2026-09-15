import { startSpotifyAutoplay, stopSpotifyAutoplay } from "./spotifyAutoplay";

interface AutoplayState {
  enabled: boolean;
}

const state: AutoplayState = {
  enabled: true,
};

export function setAutoplayEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (enabled) {
    startAutoplayMonitor();
  } else {
    stopAutoplayMonitor();
  }
}

export function isAutoplayEnabled(): boolean {
  return state.enabled;
}

export function startAutoplayMonitor(): void {
  startSpotifyAutoplay();
}

export function stopAutoplayMonitor(): void {
  stopSpotifyAutoplay();
}
