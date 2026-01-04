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
    <div className="h-full w-full pt-4 text-white">
      <div className="-mt-1.5 flex gap-5">
        <div className="shrink-0">
          <TrackInfoLayout track={track} variant="cover" size={128} />
        </div>

        <div
          className="flex-1 flex flex-col justify-start rounded-sm border-(--player-cover-border-color)/75 border"
          style={{
            background: "var(--player-panel-bg)",
            color: "var(--text-color)",
            boxShadow: "var(--player-panel-shadow)",
          }}
        >
          <div className="ml-4  mt-8">
            <TrackInfoLayout track={track} variant="title" />
            <TrackInfoLayout track={track} variant="artist" />
          </div>

          <div className="ml-4 mt-4.5 w-80">
            <PlaybackBar
              durationMs={duration}
              progressMs={progress}
              isPlaying={isPlaying}
              onSeek={(ms) => setState((s) => (s ? { ...s, progressMs: ms } : s))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LayoutA;
