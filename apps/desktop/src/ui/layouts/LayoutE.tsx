import { useEffect } from "react";
import { useCurrentlyPlaying } from "../../hooks/useCurrentlyPlaying";
import useWindowLayout from "../../hooks/useWindowLayout";
import { TrackInfoLayout } from "../components/LayoutTrackInfo/TrackInfoLayout";
import PlaybackBar from "../components/TrackControls/PlaybackBar";
import PlayerControls from "../components/TrackControls/TrackControls";

// "Portrait" — a vertical, centred card: cover on top, then title/artist,
// transport controls, and the progress bar at the foot. A tall poster look.
function LayoutE() {
  const { setLayout } = useWindowLayout();
  const { track, isPlaying, progress, duration, setState } = useCurrentlyPlaying();

  useEffect(() => {
    setLayout("E");
  }, [setLayout]);

  return (
    <div
      className="h-full w-full flex flex-col items-center px-5 pt-5 pb-6 text-white"
      style={{
        background: "var(--player-panel-bg)",
        color: "var(--text-color)",
        boxShadow: "var(--player-panel-shadow)",
      }}
    >
      <TrackInfoLayout track={track} variant="cover" size={168} />

      <div className="mt-4 flex flex-col items-center text-center min-w-0 w-full">
        <TrackInfoLayout track={track} variant="title" maxLength={24} />
        <TrackInfoLayout track={track} variant="artist" maxLength={28} />
      </div>

      <div className="mt-auto flex justify-center">
        <PlayerControls
          isPlaying={isPlaying}
          onTogglePlaying={(playing) => setState((s) => (s ? { ...s, isPlaying: playing } : s))}
        />
      </div>

      <div className="w-full -mt-2">
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

export default LayoutE;
