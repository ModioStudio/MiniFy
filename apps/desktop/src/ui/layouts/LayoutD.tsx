import { useEffect } from "react";
import { useCurrentlyPlaying } from "../../hooks/useCurrentlyPlaying";
import useWindowLayout from "../../hooks/useWindowLayout";
import { TrackInfoLayout } from "../components/LayoutTrackInfo/TrackInfoLayout";
import PlaybackBar from "../components/TrackControls/PlaybackBar";
import PlayerControls from "../components/TrackControls/TrackControls";

// "Spotlight" — a widescreen hero card: a large cover on the left, with the
// title, transport controls, and progress stacked down the right side.
function LayoutD() {
  const { setLayout } = useWindowLayout();
  const { track, isPlaying, progress, duration, setState } = useCurrentlyPlaying();

  useEffect(() => {
    setLayout("D");
  }, [setLayout]);

  return (
    <div
      className="h-full w-full flex gap-5 px-4 py-4 text-white"
      style={{
        background: "var(--player-panel-bg)",
        color: "var(--text-color)",
        boxShadow: "var(--player-panel-shadow)",
      }}
    >
      <div className="shrink-0 self-center">
        <TrackInfoLayout track={track} variant="cover" size={168} />
      </div>

      <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
        <div className="min-w-0">
          <TrackInfoLayout track={track} variant="title" maxLength={26} />
          <TrackInfoLayout track={track} variant="artist" maxLength={30} />
        </div>

        <div className="-ml-2">
          <PlayerControls
            isPlaying={isPlaying}
            onTogglePlaying={(playing) => setState((s) => (s ? { ...s, isPlaying: playing } : s))}
          />
        </div>

        <PlaybackBar
          durationMs={duration}
          progressMs={progress}
          isPlaying={isPlaying}
          onSeek={(ms) => setState((s) => (s ? { ...s, progressMs: ms } : s))}
        />
      </div>
    </div>
  );
}

export default LayoutD;
