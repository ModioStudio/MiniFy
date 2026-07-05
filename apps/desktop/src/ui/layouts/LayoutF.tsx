import { useEffect } from "react";
import { useCurrentlyPlaying } from "../../hooks/useCurrentlyPlaying";
import useWindowLayout from "../../hooks/useWindowLayout";
import { TrackInfoLayout } from "../components/LayoutTrackInfo/TrackInfoLayout";
import PlaybackBar from "../components/TrackControls/PlaybackBar";
import PlayerControls from "../components/TrackControls/TrackControls";

// "Strip" — an ultra-slim wide bar: a small cover, the track meta, and
// compact transport controls in one row, with the seek bar spanning the foot.
function LayoutF() {
  const { setLayout } = useWindowLayout();
  const { track, isPlaying, progress, duration, setState } = useCurrentlyPlaying();

  useEffect(() => {
    setLayout("F");
  }, [setLayout]);

  return (
    <div
      className="h-full w-full flex flex-col justify-center gap-1 px-4 py-3 text-white"
      style={{
        background: "var(--player-panel-bg)",
        color: "var(--text-color)",
        boxShadow: "var(--player-panel-shadow)",
      }}
    >
      <div className="flex items-center gap-3">
        <TrackInfoLayout track={track} variant="cover" size={52} />

        <div className="flex flex-col justify-center flex-1 min-w-0 leading-tight">
          <TrackInfoLayout track={track} variant="title" maxLength={28} />
          <TrackInfoLayout track={track} variant="artist" maxLength={32} />
        </div>

        <div className="shrink-0 scale-[0.62] origin-right -my-3">
          <PlayerControls
            isPlaying={isPlaying}
            onTogglePlaying={(playing) => setState((s) => (s ? { ...s, isPlaying: playing } : s))}
          />
        </div>
      </div>

      <PlaybackBar
        durationMs={duration}
        progressMs={progress}
        isPlaying={isPlaying}
        onSeek={(ms) => setState((s) => (s ? { ...s, progressMs: ms } : s))}
      />
    </div>
  );
}

export default LayoutF;
