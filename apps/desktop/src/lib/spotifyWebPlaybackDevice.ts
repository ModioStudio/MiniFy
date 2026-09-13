/**
 * The Web Playback SDK mints a fresh device id on every connect, so the id is
 * only ever valid for the lifetime of this webview. It used to be persisted in
 * localStorage, which meant that after a restart every player command was sent
 * to a device Spotify had already forgotten — the API answers 404 and the
 * fire-and-forget callers swallowed it, so controls silently did nothing.
 */

let deviceId: string | null = null;
const listeners = new Set<(deviceId: string | null) => void>();

export function getSpotifyWebPlaybackDeviceId(): string | null {
  return deviceId;
}

export function setSpotifyWebPlaybackDeviceId(next: string | null): void {
  if (deviceId === next) return;
  deviceId = next;
  for (const listener of listeners) {
    listener(deviceId);
  }
}

export function subscribeSpotifyWebPlaybackDeviceId(
  listener: (deviceId: string | null) => void
): () => void {
  listeners.add(listener);
  listener(deviceId);
  return () => {
    listeners.delete(listener);
  };
}
