import { useEffect } from "react";
import { useCurrentlyPlaying } from "../../hooks/useCurrentlyPlaying";
import useWindowLayout from "../../hooks/useWindowLayout";
import { TrackInfoLayout } from "../components/LayoutTrackInfo/TrackInfoLayout";
import PlaybackBar from "../components/TrackControls/PlaybackBar";

function LayoutA() {
  const { setLayout } = useWindowLayout();
  const { track, isPlaying, progress, duration, setState } = useCurrentlyPlaying();

  useEffect(() => {
    setLayout("A");
  }, [setLayout]);

  return (
    <div className="h-full w-full flex gap-4 px-3 pt-4 pb-6 text-white">
      <div className="mt-4">
        <TrackInfoLayout track={track} variant="cover" size={128} />
      </div>

      <div className="flex-1 mt-4">
        <TrackInfoLayout track={track} variant="title" />

        <PlaybackBar
          durationMs={duration}
          progressMs={progress}
          isPlaying={isPlaying}
          onSeek={(ms) => setState((s) => (s ? { ...s, progress_ms: ms } : s))}
          className="mt-7"
        />
      </div>
    </div>
  );
}

export default LayoutA;
