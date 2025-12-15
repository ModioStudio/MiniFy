import { useEffect, useState } from "react";
import { type CurrentlyPlaying, fetchCurrentlyPlaying } from "../../spotifyClient";
import PlaybackBar from "../PlaybackBar";
import { TrackMeta } from "../TrackDataComponent/TrackMeta";

export default function TrackInfoLayoutA() {
  const [state, setState] = useState<CurrentlyPlaying | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const cp = await fetchCurrentlyPlaying();
        if (mounted) setState(cp);
      } catch (e) {
        console.error(e);
      }
    };

    load();
    const id = setInterval(load, 3000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const track = state?.item ?? null;
  const isPlaying = state?.is_playing ?? false;
  const progress = state?.progress_ms ?? 0;
  const duration = state?.item?.duration_ms ?? 0;

  return (
    <div className="w-full justify-center mt-4">
      {track && (
        <>
          <TrackMeta
            title={track.name}
            artists={track.artists.map((a: { name: string }) => a.name).join(", ")}
          />
          <PlaybackBar
            durationMs={duration}
            progressMs={progress}
            isPlaying={isPlaying}
            onSeek={(ms) => setState((s) => (s ? { ...s, progress_ms: ms } : s))}
            className="mt-7"
          />
        </>
      )}
    </div>
  );
}
