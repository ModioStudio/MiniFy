import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useAIQueueStore } from "../lib/aiQueueStore";
import { readSettings, writeSettings, type LastPlayedTrack } from "../lib/settingLib";
import { type CurrentlyPlaying, type SimplifiedTrack, fetchCurrentlyPlaying } from "../ui/spotifyClient";

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

function trackToCache(track: SimplifiedTrack, progressMs: number): LastPlayedTrack {
  return {
    track: {
      id: track.id,
      name: track.name,
      duration_ms: track.duration_ms,
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

function cacheToCurrentlyPlaying(cache: LastPlayedTrack): CurrentlyPlaying {
  return {
    is_playing: false,
    progress_ms: cache.progress_ms,
    item: {
      id: cache.track.id,
      name: cache.track.name,
      duration_ms: cache.track.duration_ms,
      artists: cache.track.artists,
      album: cache.track.album,
    },
  };
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveTrack(track: SimplifiedTrack, progressMs: number): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    const cached = trackToCache(track, progressMs);
    writeSettings({ last_played_track: cached }).catch(console.error);
    saveTimeout = null;
  }, 2000);
}

export function useCurrentlyPlaying(pollMs = 3000) {
  const [state, setState] = useState<CurrentlyPlaying | null>(null);
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
        setState(cacheToCurrentlyPlaying(settings.last_played_track));
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const cp = await fetchCurrentlyPlaying();
        if (!mounted) return;

        const hasActiveTrack = cp?.item !== null && cp?.item !== undefined;
        
        if (hasActiveTrack && cp.item) {
          debouncedSaveTrack(cp.item, cp.progress_ms ?? 0);
        }

        const trackId = cp?.item?.id ?? null;
        const isPlaying = cp?.is_playing ?? false;
        const aiQueueActive = useAIQueueStore.getState().isActive;

        if (
          trackId !== lastTrackRef.current ||
          isPlaying !== lastPlayingRef.current ||
          aiQueueActive !== lastAIQueueRef.current
        ) {
          lastTrackRef.current = trackId;
          lastPlayingRef.current = isPlaying;
          lastAIQueueRef.current = aiQueueActive;

          const trackName = cp?.item?.name ?? null;
          const artistName = cp?.item?.artists?.map((a) => a.name).join(", ") ?? null;
          updateDiscordPresence(trackName, artistName, isPlaying, aiQueueActive);
        }

        setState((prev) => {
          if (!hasActiveTrack && !initialLoadDone.current) {
            initialLoadDone.current = true;
            return prev;
          }
          
          initialLoadDone.current = true;

          if (hasActiveTrack) {
            if (
              prev?.item?.id === cp?.item?.id &&
              prev?.is_playing === cp?.is_playing &&
              prev?.progress_ms === cp?.progress_ms
            ) {
              return prev;
            }
            return cp;
          }
          
          if (prev?.item && !prev?.is_playing) {
            return prev;
          }
          
          if (prev?.is_playing) {
            return { ...prev, is_playing: false };
          }
          
          return prev;
        });
      } catch (e) {
        console.error(e);
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
    track: state?.item ?? null,
    isPlaying: state?.is_playing ?? false,
    progress: state?.progress_ms ?? 0,
    duration: state?.item?.duration_ms ?? 0,
    setState,
  };
}
