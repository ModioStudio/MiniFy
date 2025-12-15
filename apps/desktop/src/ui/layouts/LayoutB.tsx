import { useEffect, useState } from "react";
import { TrackInfo } from "../components/LayoutTrackInfo/TrackInfoLayoutB";
import PlaybackBar from "../components/PlaybackBar";
import PlayerControls from "../components/TrackDataComponent/TrackControls";
import useWindowLayout from "../hooks/useWindowLayout";
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

  const { setLayout } = useWindowLayout();

  useEffect(() => {
    setLayout("B");
  }, [setLayout]);

  return (
    <div className="h-full w-full rounded-xl bg-black/70 px-3 pt-4 pb-6 text-white shadow-lg grid grid-rows-[auto_1fr_auto]">
      <TrackInfo track={state?.item ?? null} />

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
        className="-mt-3"
      />
    </div>
  );
}

export default LayoutB;
