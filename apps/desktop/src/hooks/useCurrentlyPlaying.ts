import { useEffect, useState } from "react";
import { type CurrentlyPlaying, fetchCurrentlyPlaying } from "../ui/spotifyClient";

export function useCurrentlyPlaying(pollMs = 3000) {
  const [state, setState] = useState<CurrentlyPlaying | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const cp = await fetchCurrentlyPlaying();
        if (!mounted) return;

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
