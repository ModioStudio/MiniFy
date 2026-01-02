import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useAIQueueStore } from "../lib/aiQueueStore";
import { type CurrentlyPlaying, fetchCurrentlyPlaying } from "../ui/spotifyClient";

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

export function useCurrentlyPlaying(pollMs = 3000) {
  const [state, setState] = useState<CurrentlyPlaying | null>(null);
  const lastTrackRef = useRef<string | null>(null);
  const lastPlayingRef = useRef<boolean>(false);
  const lastAIQueueRef = useRef<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const cp = await fetchCurrentlyPlaying();
        if (!mounted) return;

        const trackId = cp?.item?.id ?? null;
        const isPlaying = cp?.is_playing ?? false;
        const aiQueueActive = useAIQueueStore.getState().isActive;

        // Update Discord presence when track, playing state, or AI Queue state changes
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
          if (
            prev?.item?.id === cp?.item?.id &&
            prev?.is_playing === cp?.is_playing &&
            prev?.progress_ms === cp?.progress_ms
          ) {
            return prev;
          }
          return cp;
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
