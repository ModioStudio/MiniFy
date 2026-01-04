import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useAIQueueStore } from "../lib/aiQueueStore";
import { readSettings, writeSettings, type LastPlayedTrack } from "../lib/settingLib";
import { getActiveProvider, getActiveProviderType, type UnifiedTrack, type PlaybackState } from "../providers";

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
    },
    progress_ms: progressMs,
    cached_at: Date.now(),
  };
}

function cacheToPlaybackState(cache: LastPlayedTrack): PlaybackState {
  return {
    isPlaying: false,
    progressMs: cache.progress_ms,
    track: {
      id: cache.track.id,
      name: cache.track.name,
      durationMs: cache.track.duration_ms,
      artists: cache.track.artists,
      album: cache.track.album,
      uri: `spotify:track:${cache.track.id}`,
      provider: "spotify",
    },
  };
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveTrack(track: UnifiedTrack, progressMs: number): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    const cached = unifiedTrackToCache(track, progressMs);
    writeSettings({ last_played_track: cached }).catch(console.error);
    saveTimeout = null;
  }, 2000);
}

export interface CurrentPlayingState {
  track: UnifiedTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  provider: "spotify" | "youtube" | null;
}

export function useCurrentlyPlaying(pollMs = 3000) {
  const [state, setState] = useState<PlaybackState | null>(null);
  const [activeProvider, setActiveProvider] = useState<"spotify" | "youtube" | null>(null);
  const lastTrackRef = useRef<string | null>(null);
  const lastPlayingRef = useRef<boolean>(false);
  const lastAIQueueRef = useRef<boolean>(false);
  const initialLoadDone = useRef<boolean>(false);
  const cachedTrackLoaded = useRef<boolean>(false);

  useEffect(() => {
    if (cachedTrackLoaded.current) return;
    cachedTrackLoaded.current = true;

    readSettings().then((settings) => {
      if (settings.last_played_track) {
        setState(cacheToPlaybackState(settings.last_played_track));
      }
      if (settings.active_music_provider) {
        setActiveProvider(settings.active_music_provider);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const providerType = await getActiveProviderType();
        const provider = await getActiveProvider();
        
        if (!mounted) return;
        
        setActiveProvider(providerType);

        const playbackState = await provider.getPlaybackState();
        if (!mounted) return;

        const hasActiveTrack = playbackState?.track !== null && playbackState?.track !== undefined;
        
        if (hasActiveTrack && playbackState?.track) {
          debouncedSaveTrack(playbackState.track, playbackState.progressMs ?? 0);
        }

        const trackId = playbackState?.track?.id ?? null;
        const isPlaying = playbackState?.isPlaying ?? false;
        const aiQueueActive = useAIQueueStore.getState().isActive;

        if (
          trackId !== lastTrackRef.current ||
          isPlaying !== lastPlayingRef.current ||
          aiQueueActive !== lastAIQueueRef.current
        ) {
          lastTrackRef.current = trackId;
          lastPlayingRef.current = isPlaying;
          lastAIQueueRef.current = aiQueueActive;

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

    load();
    const id = setInterval(load, pollMs);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return {
    track: state?.track ?? null,
    isPlaying: state?.isPlaying ?? false,
    progress: state?.progressMs ?? 0,
    duration: state?.track?.durationMs ?? 0,
    provider: activeProvider,
    setState,
  };
}
