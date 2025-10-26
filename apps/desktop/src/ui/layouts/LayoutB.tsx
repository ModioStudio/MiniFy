import { useEffect, useState } from "react";
import PlaybackBar from "../components/PlaybackBar";
import PlayerControls from "../components/PlayerControls";
import TrackInfo from "../components/TrackInfo";
import { type CurrentlyPlaying, fetchCurrentlyPlaying } from "../spotifyClient";

function LayoutB() {
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
    const id = setInterval(load, 3_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const isPlaying = state?.is_playing ?? false;
  const progress = state?.progress_ms ?? 0;
  const duration = state?.item?.duration_ms ?? 0;

  return (
    <div className="px-3 pt-3 pb-12 text-white bg-black/70 rounded-xl shadow-lg h-full w-full flex flex-col">
      <TrackInfo track={state?.item ?? null} className="mb-3" />
      <div className="mt-auto flex flex-col gap-6 pb-10">
        <div className="flex items-center justify-center">
          <PlayerControls
            isPlaying={isPlaying}
            onTogglePlaying={(playing) => setState((s) => (s ? { ...s, is_playing: playing } : s))}
          />
        </div>
        <PlaybackBar
          durationMs={duration}
          progressMs={progress}
          isPlaying={isPlaying}
          onSeek={(ms) => setState((s) => (s ? { ...s, progress_ms: ms } : s))}
        />
      </div>
    </div>
  );
}

export default LayoutB;
