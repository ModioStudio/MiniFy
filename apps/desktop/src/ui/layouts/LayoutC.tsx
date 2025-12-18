import { useEffect } from "react";
import { useCurrentlyPlaying } from "../../hooks/useCurrentlyPlaying";
import useWindowLayout from "../../hooks/useWindowLayout";
import { TrackInfoLayout } from "../components/LayoutTrackInfo/TrackInfoLayout";
import PlaybackBar from "../components/TrackControls/PlaybackBar";
import PlayerControls from "../components/TrackControls/TrackControls";

function LayoutC() {
  const { setLayout } = useWindowLayout();

  const { track, isPlaying, progress, duration, setState } = useCurrentlyPlaying();

  useEffect(() => {
    setLayout("C");
  }, [setLayout]);

  return (
    <div className="h-full w-full rounded-xl bg-black/70 p-4 text-white shadow-lg">
      <div className="grid grid-cols-[auto_1fr] gap-4 h-full">
        <div className="w-24 h-24">
          <TrackInfoLayout track={track} variant="cover" />
        </div>

        <div className="grid grid-rows-[auto_auto_1fr] gap-2">
          <PlaybackBar
            durationMs={duration}
            progressMs={progress}
            isPlaying={isPlaying}
            onSeek={(ms) => setState((s) => (s ? { ...s, progress_ms: ms } : s))}
          />

          <div className="flex items-center justify-between gap-3">
            <TrackInfoLayout track={track} variant="title" />

            <PlayerControls
              isPlaying={isPlaying}
              onTogglePlaying={(playing) =>
                setState((s) => (s ? { ...s, is_playing: playing } : s))
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LayoutC;
