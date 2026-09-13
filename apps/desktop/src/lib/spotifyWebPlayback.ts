import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
  type SimplifiedAlbum,
  type SimplifiedArtist,
  type SimplifiedTrack,
  transferPlayback,
} from "../ui/spotifyClient";
import { logDiagnostic } from "./diagnostics";
import { probeDrmSupport } from "./drmSupport";
import {
  getSpotifyWebPlaybackDeviceId,
  setSpotifyWebPlaybackDeviceId,
} from "./spotifyWebPlaybackDevice";

type SpotifyWebPlaybackError = { message: string };
type SpotifyWebPlaybackDevice = { device_id: string };

type SpotifyWebPlaybackTrack = {
  id?: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: Array<{ name: string; uri?: string }>;
  album: {
    name: string;
    uri?: string;
    images: Array<{ url: string; height?: number; width?: number }>;
  };
};

export type SpotifyWebPlaybackState = {
  paused: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat_mode: number;
  track_window: {
    current_track: SpotifyWebPlaybackTrack | null;
    next_tracks: SpotifyWebPlaybackTrack[];
    previous_tracks: SpotifyWebPlaybackTrack[];
  };
};

type SpotifyPlayerEvent =
  | "ready"
  | "not_ready"
  | "player_state_changed"
  | "autoplay_failed"
  | "initialization_error"
  | "authentication_error"
  | "account_error"
  | "playback_error";

type SpotifyEventPayload =
  | SpotifyWebPlaybackDevice
  | SpotifyWebPlaybackState
  | SpotifyWebPlaybackError;

type SpotifyWebPlayer = {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  getCurrentState(): Promise<SpotifyWebPlaybackState | null>;
  getVolume(): Promise<number>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  addListener(event: SpotifyPlayerEvent, callback: (payload: SpotifyEventPayload) => void): boolean;
};

type SpotifyPlayerConstructor = new (options: {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
  enableMediaSession?: boolean;
}) => SpotifyWebPlayer;

declare global {
  interface Window {
    Spotify?: { Player: SpotifyPlayerConstructor };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

/**
 * Why local playback is unavailable. The UI has to tell these apart: a missing
 * Widevine CDM and a free account both end in "no audio here", but only one of
 * them is the user's to fix.
 */
export type SpotifyPlaybackFailure =
  | "none"
  | "drm-unavailable"
  | "premium-required"
  | "auth"
  | "sdk-unavailable"
  | "connect-failed"
  | "playback";

export type SpotifyWebPlaybackStatus = {
  /** True once MiniFy is registered with Spotify as a playable Connect device. */
  ready: boolean;
  connecting: boolean;
  deviceId: string | null;
  failure: SpotifyPlaybackFailure;
  error: string | null;
  /** Whether this webview can decrypt Spotify audio at all. */
  drmAvailable: boolean | null;
};

export type SpotifyLocalPlayback = {
  paused: boolean;
  positionMs: number;
  durationMs: number;
  shuffle: boolean;
  repeatMode: number;
  track: SimplifiedTrack | null;
  /** Wall clock at capture, so position can be extrapolated between events. */
  sampledAt: number;
};

const SCRIPT_ID = "spotify-web-playback-sdk";
const DEVICE_NAME = "MiniFy";
const MAX_RECONNECT_ATTEMPTS = 6;
/**
 * A rejected token is retried once with a freshly minted one. If that is also
 * rejected the problem is the grant itself — almost always a login made before
 * MiniFy asked for the `streaming` scope — and retrying forever would just
 * register a new Connect device every second.
 */
const MAX_AUTH_RETRIES = 2;
/** How long a device has to survive before its connection counts as healthy. */
const HEALTHY_AFTER_MS = 20_000;
/** The Web API does not see a device the instant the SDK reports it ready. */
const TRANSFER_RETRY_DELAYS_MS = [0, 600, 1500, 3000, 6000];

const DEFAULT_STATUS: SpotifyWebPlaybackStatus = {
  ready: false,
  connecting: false,
  deviceId: null,
  failure: "none",
  error: null,
  drmAvailable: null,
};

let status: SpotifyWebPlaybackStatus = DEFAULT_STATUS;
let localPlayback: SpotifyLocalPlayback | null = null;
let player: SpotifyWebPlayer | null = null;
let initPromise: Promise<void> | null = null;
let reconnectAttempts = 0;
let authRetries = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let healthyTimer: ReturnType<typeof setTimeout> | null = null;
let disposed = false;
let pendingVolume = 0.5;

const statusSubscribers = new Set<(status: SpotifyWebPlaybackStatus) => void>();
const playbackSubscribers = new Set<(state: SpotifyLocalPlayback | null) => void>();

function publishStatus(next: Partial<SpotifyWebPlaybackStatus>): void {
  status = { ...status, ...next };
  for (const subscriber of statusSubscribers) {
    subscriber(status);
  }
}

function publishPlayback(next: SpotifyLocalPlayback | null): void {
  localPlayback = next;
  for (const subscriber of playbackSubscribers) {
    subscriber(localPlayback);
  }
}

function errorMessage(payload: SpotifyEventPayload): string {
  return "message" in payload ? payload.message : "Spotify playback failed";
}

function isDevicePayload(payload: SpotifyEventPayload): payload is SpotifyWebPlaybackDevice {
  return "device_id" in payload;
}

function isStatePayload(payload: SpotifyEventPayload): payload is SpotifyWebPlaybackState {
  return "track_window" in payload;
}

function loadSpotifySdkScript(): Promise<void> {
  if (window.Spotify?.Player) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Spotify Web Playback SDK did not load in time")),
      20_000
    );
    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Could not load the Spotify Web Playback SDK"));
    };
    document.body.appendChild(script);
  });
}

export function subscribeSpotifyWebPlaybackStatus(
  subscriber: (status: SpotifyWebPlaybackStatus) => void
): () => void {
  statusSubscribers.add(subscriber);
  subscriber(status);
  return () => {
    statusSubscribers.delete(subscriber);
  };
}

export function subscribeSpotifyLocalPlayback(
  subscriber: (state: SpotifyLocalPlayback | null) => void
): () => void {
  playbackSubscribers.add(subscriber);
  subscriber(localPlayback);
  return () => {
    playbackSubscribers.delete(subscriber);
  };
}

export function getSpotifyWebPlaybackStatus(): SpotifyWebPlaybackStatus {
  return status;
}

export function getSpotifyLocalPlayback(): SpotifyLocalPlayback | null {
  return localPlayback;
}

export function isSpotifyWebPlaybackReady(): boolean {
  return status.ready && player !== null;
}

export function getSpotifyWebPlaybackDevice(): string | null {
  return getSpotifyWebPlaybackDeviceId();
}

function scheduleReconnect(reason: string): void {
  if (disposed || reconnectTimer) return;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    publishStatus({
      ready: false,
      connecting: false,
      failure: "connect-failed",
      error: `Gave up reconnecting to Spotify after ${MAX_RECONNECT_ATTEMPTS} attempts (${reason})`,
    });
    return;
  }

  const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempts);
  reconnectAttempts += 1;
  logDiagnostic("playback", `reconnect in ${delay}ms (attempt ${reconnectAttempts}): ${reason}`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    teardownPlayer();
    initPromise = null;
    void initializeSpotifyWebPlayback();
  }, delay);
}

function teardownPlayer(): void {
  if (healthyTimer) {
    clearTimeout(healthyTimer);
    healthyTimer = null;
  }
  if (player) {
    try {
      player.disconnect();
    } catch {
      // The SDK throws when it was never connected; nothing to clean up then.
    }
  }
  player = null;
  setSpotifyWebPlaybackDeviceId(null);
  publishPlayback(null);
}

async function claimPlaybackDevice(deviceId: string): Promise<void> {
  // Registering the device is not enough. Until playback is transferred, every
  // Web API call still targets whatever Spotify considers the active device,
  // which is normally the official desktop client. This transfer is what makes
  // MiniFy a player rather than a remote control.
  //
  // The `ready` event fires before Spotify's backend has published the device,
  // so the first transfer reliably 404s. Retry until it lands.
  for (const delay of TRANSFER_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (getSpotifyWebPlaybackDeviceId() !== deviceId) return;

    try {
      await transferPlayback(deviceId, false);
      logDiagnostic("playback", `transferred playback to ${deviceId}`);
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!detail.includes("404")) {
        logDiagnostic("playback", `transfer failed: ${detail}`);
        return;
      }
    }
  }

  logDiagnostic("playback", `device ${deviceId} never became visible to the Web API`);
}

function handleStateChange(state: SpotifyWebPlaybackState | null): void {
  if (!state) {
    // The SDK reports null once playback moved to a different device.
    publishPlayback(null);
    return;
  }

  const track = state.track_window.current_track;
  publishPlayback({
    paused: state.paused,
    positionMs: state.position,
    durationMs: state.duration,
    shuffle: state.shuffle,
    repeatMode: state.repeat_mode,
    track: track ? spotifyWebPlaybackTrackToSimplifiedTrack(track) : null,
    sampledAt: Date.now(),
  });
}

export function initializeSpotifyWebPlayback(): Promise<void> {
  if (initPromise) return initPromise;

  disposed = false;

  initPromise = (async () => {
    publishStatus({ connecting: true, error: null, failure: "none" });

    const drm = await probeDrmSupport();
    publishStatus({ drmAvailable: drm.widevine });

    if (!drm.widevine) {
      // Without a CDM the SDK still connects and playback even starts, because
      // Spotify ships a few seconds of unencrypted lead-in — and then it dies
      // mid-track. Refusing to connect keeps MiniFy honest and leaves Connect
      // control pointed at a device that can actually decode.
      publishStatus({
        ready: false,
        connecting: false,
        failure: "drm-unavailable",
        error:
          "This webview has no Widevine CDM, so Spotify audio cannot be decrypted here. " +
          "MiniFy can still control your other Spotify devices.",
      });
      logDiagnostic("playback", `no widevine: ${drm.detail}`);
      return;
    }

    try {
      await loadSpotifySdkScript();

      if (!window.Spotify?.Player) {
        throw new Error("Spotify Web Playback SDK is unavailable");
      }

      const instance = new window.Spotify.Player({
        name: DEVICE_NAME,
        getOAuthToken: (callback) => {
          void getSpotifyAccessToken()
            .then(callback)
            .catch((error) => {
              publishStatus({
                ready: false,
                connecting: false,
                failure: "auth",
                error: error instanceof Error ? error.message : String(error),
              });
            });
        },
        volume: pendingVolume,
        enableMediaSession: true,
      });
      player = instance;

      instance.addListener("ready", (payload) => {
        if (!isDevicePayload(payload)) return;
        // Do not clear the retry budget here. A grant without `streaming` still
        // reaches `ready` before being rejected, so resetting on `ready` turns
        // a broken login into an endless register/reject loop that spawns a new
        // Connect device every second. Only a connection that *survives*
        // counts.
        if (healthyTimer) clearTimeout(healthyTimer);
        healthyTimer = setTimeout(() => {
          reconnectAttempts = 0;
          authRetries = 0;
        }, HEALTHY_AFTER_MS);

        setSpotifyWebPlaybackDeviceId(payload.device_id);
        publishStatus({
          ready: true,
          connecting: false,
          deviceId: payload.device_id,
          failure: "none",
          error: null,
        });
        logDiagnostic("playback", `device ready: ${payload.device_id}`);
        void claimPlaybackDevice(payload.device_id);
      });

      instance.addListener("not_ready", (payload) => {
        if (!isDevicePayload(payload)) return;
        setSpotifyWebPlaybackDeviceId(null);
        publishStatus({ ready: false, connecting: true, deviceId: null });
        scheduleReconnect("device went offline");
      });

      instance.addListener("initialization_error", (payload) => {
        publishStatus({
          ready: false,
          connecting: false,
          failure: "sdk-unavailable",
          error: errorMessage(payload),
        });
      });

      instance.addListener("authentication_error", (payload) => {
        const message = errorMessage(payload);
        authRetries += 1;

        if (authRetries > MAX_AUTH_RETRIES) {
          disposed = true;
          teardownPlayer();
          publishStatus({
            ready: false,
            connecting: false,
            failure: "auth",
            error:
              "Spotify rejected this login for playback. Reconnect your account — a login " +
              "made before MiniFy could stream does not carry the streaming permission.",
          });
          logDiagnostic("playback", `auth rejected ${authRetries}x, giving up: ${message}`);
          return;
        }

        publishStatus({ ready: false, connecting: true, failure: "auth", error: message });
        // The SDK holds on to the token it was handed, so a plain reconnect
        // would replay the rejected one. Mint a fresh one first.
        void forceRefreshSpotifyAccessToken()
          .then(() => scheduleReconnect("token rejected"))
          .catch(() => {
            publishStatus({
              connecting: false,
              failure: "auth",
              error: `${message} — sign in to Spotify again.`,
            });
          });
      });

      instance.addListener("account_error", (payload) => {
        publishStatus({
          ready: false,
          connecting: false,
          failure: "premium-required",
          error: errorMessage(payload),
        });
      });

      instance.addListener("playback_error", (payload) => {
        publishStatus({ failure: "playback", error: errorMessage(payload) });
        logDiagnostic("playback", `playback_error: ${errorMessage(payload)}`);
      });

      instance.addListener("autoplay_failed", () => {
        publishStatus({
          failure: "playback",
          error: "Spotify blocked autoplay. Press play once to start audio.",
        });
      });

      instance.addListener("player_state_changed", (payload) => {
        if (!isStatePayload(payload)) return;
        if (status.failure === "playback") {
          publishStatus({ failure: "none", error: null });
        }
        handleStateChange(payload);
      });

      const connected = await instance.connect();
      if (!connected) {
        publishStatus({
          ready: false,
          connecting: false,
          failure: "connect-failed",
          error: "The Spotify Web Playback SDK refused to connect",
        });
      }
    } catch (error) {
      publishStatus({
        ready: false,
        connecting: false,
        failure: "sdk-unavailable",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return initPromise;
}

export async function disconnectSpotifyWebPlayback(): Promise<void> {
  disposed = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  authRetries = 0;
  teardownPlayer();
  initPromise = null;
  status = DEFAULT_STATUS;
  publishStatus({});
}

/**
 * Chromium blocks audio until the page has seen a user gesture. Call this from
 * a click handler, before any await, or the gesture is already gone.
 */
export function activateSpotifyWebPlayback(): Promise<void> {
  return player?.activateElement() ?? Promise.resolve();
}

export async function getSpotifyWebPlaybackState(): Promise<SpotifyWebPlaybackState | null> {
  return (await player?.getCurrentState()) ?? null;
}

export async function resumeSpotifyWebPlayback(): Promise<void> {
  await player?.resume();
}

export async function pauseSpotifyWebPlayback(): Promise<void> {
  await player?.pause();
}

export async function nextSpotifyWebPlaybackTrack(): Promise<void> {
  await player?.nextTrack();
}

export async function previousSpotifyWebPlaybackTrack(): Promise<void> {
  await player?.previousTrack();
}

export async function seekSpotifyWebPlayback(positionMs: number): Promise<void> {
  await player?.seek(Math.max(0, Math.floor(positionMs)));
}

export async function setSpotifyWebPlaybackVolume(volumePercent: number): Promise<void> {
  pendingVolume = Math.max(0, Math.min(1, volumePercent / 100));
  await player?.setVolume(pendingVolume);
}

export function spotifyWebPlaybackTrackToSimplifiedTrack(
  track: SpotifyWebPlaybackTrack
): SimplifiedTrack {
  const trackId = track.id ?? track.uri.replace("spotify:track:", "");
  const albumUri = track.album.uri ?? "";
  return {
    id: trackId,
    name: track.name,
    duration_ms: track.duration_ms,
    artists: track.artists.map((artist, index): SimplifiedArtist => {
      const id = artist.uri?.replace("spotify:artist:", "") ?? `spotify-artist-${index}`;
      return { id, name: artist.name };
    }),
    album: {
      id: albumUri.replace("spotify:album:", "") || "spotify-web-playback",
      name: track.album.name,
      images: track.album.images.map((image): SimplifiedAlbum["images"][number] => ({
        url: image.url,
        height: image.height ?? 300,
        width: image.width ?? 300,
      })),
    },
  };
}
