import { useEffect } from "react";
import { useCurrentlyPlaying } from "../../hooks/useCurrentlyPlaying";
import useWindowLayout from "../../hooks/useWindowLayout";
import { TrackInfoLayout } from "../components/LayoutTrackInfo/TrackInfoLayout";
import PlaybackBar from "../components/TrackControls/PlaybackBar";
import PlayerControls from "../components/TrackControls/TrackControls";

function LayoutB() {
  const { setLayout } = useWindowLayout();

  const { track, isPlaying, progress, duration, setState } = useCurrentlyPlaying();

  useEffect(() => {
    setLayout("B");
  }, [setLayout]);

  return (
    <div className="h-full w-full rounded-xl bg-black/70 px-3 pt-4 pb-6 text-white shadow-lg grid grid-rows-[auto_1fr_auto]">
      <TrackInfoLayout track={track} variant="title" />

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
