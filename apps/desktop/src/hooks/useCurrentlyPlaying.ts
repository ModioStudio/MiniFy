import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { useAIQueueStore } from "../lib/aiQueueStore";
import { startAutoplayMonitor, stopAutoplayMonitor } from "../lib/playback/autoplayService";
import { initializePlaybackSession } from "../lib/playback/session";
import { usePlaybackSession } from "../lib/playback/sessionStore";
import { startKeepAlive, stopKeepAlive } from "../lib/playback/spotifyKeepAlive";
import {
  type LastPlayedTrack,
  type MusicProviderType,
  type ProviderPlaybackCache,
  readSettings,
  writeSettings,
} from "../lib/settingLib";
import {
  getActiveProvider,
  getActiveProviderType,
  type PlaybackState,
  type UnifiedTrack,
} from "../providers";

/**
 * Only the main window reports to Discord. The mini player polls on its own
 * schedule and, reporting too, overwrote the main window with a staler state:
 * the "Paused" that stuck on Discord while music played.
 */
const IS_MAIN_WINDOW = getCurrentWindow().label === "main";
/** Resent now and then, so a Discord started later, or one that dropped an update, catches up. */
const PRESENCE_REFRESH_MS = 30_000;

function updateDiscordPresence(
  trackName: string | null,
  artistName: string | null,
  isPlaying: boolean,
  aiQueueActive: boolean
): void {
  invoke("update_discord_presence", {
    trackName,
    artistName,
    isPlaying,
    aiQueueActive,
  }).catch(() => {
    // Silently ignore Discord RPC errors
  });
}

function unifiedTrackToCache(track: UnifiedTrack, progressMs: number): LastPlayedTrack {
  return {
    track: {
      id: track.id,
      name: track.name,
      duration_ms: track.durationMs,
      artists: track.artists.map((a) => ({ id: a.id, name: a.name })),
      album: {
        id: track.album.id,
        name: track.album.name,
        images: track.album.images.map((img) => ({
          url: img.url,
          height: img.height,
          width: img.width,
        })),
      },
      uri: track.uri,
      provider: track.provider,
    },
    progress_ms: progressMs,
    cached_at: Date.now(),
  };
}

function cacheToPlaybackState(cache: LastPlayedTrack): PlaybackState {
  const cachedProvider = cache.track.provider ?? "spotify";
  const cachedUri = cache.track.uri ?? `spotify:track:${cache.track.id}`;

  return {
    isPlaying: false,
    progressMs: cache.progress_ms,
    track: {
      id: cache.track.id,
      name: cache.track.name,
      durationMs: cache.track.duration_ms,
      artists: cache.track.artists,
      album: cache.track.album,
      uri: cachedUri,
      provider: cachedProvider,
    },
  };
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let currentProviderCache: ProviderPlaybackCache = { spotify: null };
/** How stale the saved resume position may get while one track plays. */
const CACHE_SAVE_EVERY_MS = 30_000;
let lastCacheSave: { trackId: string; at: number } | null = null;

async function saveTrackToProviderCache(
  provider: MusicProviderType,
  track: UnifiedTrack,
  progressMs: number
): Promise<void> {
  const cached = unifiedTrackToCache(track, progressMs);
  currentProviderCache[provider] = cached;

  // Written for a new track, then every half minute. It used to go out on
  // every poll: a file read and write in Rust plus a broadcast to every
  // window, every 2.5 seconds, for as long as music played.
  const recent =
    lastCacheSave?.trackId === track.id && Date.now() - lastCacheSave.at < CACHE_SAVE_EVERY_MS;
  if (recent) return;
  lastCacheSave = { trackId: track.id, at: Date.now() };

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    await writeSettings({
      provider_playback_cache: currentProviderCache,
      last_played_track: cached,
    });
    saveTimeout = null;
  }, 2000);
}

export async function getLastPlayedForProvider(
  provider: MusicProviderType
): Promise<LastPlayedTrack | null> {
  const settings = await readSettings();

  // First check the new per-provider cache
  if (settings.provider_playback_cache?.[provider]) {
    return settings.provider_playback_cache[provider];
  }

  // Fallback to old single cache if it matches the provider
  if (settings.last_played_track?.track.provider === provider) {
    return settings.last_played_track;
  }

  return null;
}

export interface CurrentPlayingState {
  track: UnifiedTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  provider: MusicProviderType | null;
}

export function useCurrentlyPlaying(pollMs = 3000) {
  // Field by field: subscribing to the whole session re-rendered on every change.
  const sessionLocal = usePlaybackSession((session) => session.local);
  const sessionPlayback = usePlaybackSession((session) => session.playback);
  const [state, setState] = useState<PlaybackState | null>(null);
  const [activeProvider, setActiveProvider] = useState<MusicProviderType | null>(null);
  const lastTrackRef = useRef<string | null>(null);
  const lastPlayingRef = useRef<boolean>(false);
  const lastAIQueueRef = useRef<boolean>(false);
  const lastPresenceAt = useRef<number>(0);
  const initialLoadDone = useRef<boolean>(false);
  const cachedTrackLoaded = useRef<boolean>(false);

  // Load cached track on mount and start services
  useEffect(() => {
    if (cachedTrackLoaded.current) return;
    cachedTrackLoaded.current = true;

    (async () => {
      try {
        const settings = await readSettings();
        const provider = settings.active_music_provider ?? null;
        setActiveProvider(provider);

        // Load provider cache into memory
        if (settings.provider_playback_cache) {
          currentProviderCache = settings.provider_playback_cache;
        }

        // Load cached track for current provider
        if (provider) {
          const cached = await getLastPlayedForProvider(provider);
          if (cached) {
            setState(cacheToPlaybackState(cached));
          }
        }

        // Start playback services
        await initializePlaybackSession();
        if (IS_MAIN_WINDOW) {
          startAutoplayMonitor();
          startKeepAlive();
        }
      } catch (err) {
        console.error("Failed to load cached track:", err);
      }
    })();

    return () => {
      if (IS_MAIN_WINDOW) {
        stopAutoplayMonitor();
        stopKeepAlive();
      }
    };
  }, []);

  // Poll for current playback state
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const providerType = await getActiveProviderType();
        const provider = await getActiveProvider();

        if (!mounted) return;

        setActiveProvider(providerType);

        let playbackState: PlaybackState | null = null;

        try {
          playbackState = await provider.getPlaybackState();
        } catch (apiError) {
          console.warn("API call failed, using cache:", apiError);
          // API failed, try to use cached state for this provider
          const cached = await getLastPlayedForProvider(providerType);
          if (cached) {
            playbackState = cacheToPlaybackState(cached);
          }
        }

        if (!mounted) return;

        const hasActiveTrack = playbackState?.track !== null && playbackState?.track !== undefined;

        // Save to provider-specific cache
        if (hasActiveTrack && playbackState?.track) {
          saveTrackToProviderCache(
            providerType,
            playbackState.track,
            playbackState.progressMs ?? 0
          );
        }

        const trackId = playbackState?.track?.id ?? null;
        const isPlaying = playbackState?.isPlaying ?? false;
        const aiQueueActive = useAIQueueStore.getState().isActive;

        const changed =
          trackId !== lastTrackRef.current ||
          isPlaying !== lastPlayingRef.current ||
          aiQueueActive !== lastAIQueueRef.current;
        const stale = Date.now() - lastPresenceAt.current > PRESENCE_REFRESH_MS;

        if (IS_MAIN_WINDOW && (changed || stale)) {
          lastTrackRef.current = trackId;
          lastPlayingRef.current = isPlaying;
          lastAIQueueRef.current = aiQueueActive;
          lastPresenceAt.current = Date.now();

          const trackName = playbackState?.track?.name ?? null;
          const artistName = playbackState?.track?.artists?.map((a) => a.name).join(", ") ?? null;
          updateDiscordPresence(trackName, artistName, isPlaying, aiQueueActive);
        }

        setState((prev) => {
          if (!hasActiveTrack && !initialLoadDone.current) {
            initialLoadDone.current = true;
            return prev;
          }

          initialLoadDone.current = true;

          if (hasActiveTrack && playbackState) {
            if (
              prev?.track?.id === playbackState?.track?.id &&
              prev?.isPlaying === playbackState?.isPlaying &&
              prev?.progressMs === playbackState?.progressMs
            ) {
              return prev;
            }
            return playbackState;
          }

          if (prev?.track && !prev?.isPlaying) {
            return prev;
          }

          if (prev?.isPlaying) {
            return { ...prev, isPlaying: false };
          }

          return prev;
        });
      } catch (e) {
        console.error("Error fetching playback state:", e);
      }
    };

    // One poll at a time. When calls into Rust slowed down, overlapping polls
    // piled more calls onto the queue that was already too slow.
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        await load();
      } finally {
        polling = false;
      }
    };

    poll();
    const id = setInterval(poll, pollMs);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pollMs]);

  const displayed = sessionLocal ? sessionPlayback : state;
  return {
    track: displayed?.track ?? null,
    isPlaying: displayed?.isPlaying ?? false,
    progress: displayed?.progressMs ?? 0,
    duration: displayed?.track?.durationMs ?? 0,
    provider: displayed?.track?.provider ?? activeProvider,
    setState,
  };
}
