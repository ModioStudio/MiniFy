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
    <div
      className="
        h-full w-full
        grid grid-rows-[auto_1fr_auto]
        px-3 pt-4 pb-6
      "
      style={{
        background: "var(--player-panel-bg)",
        color: "var(--text-color)",
        boxShadow: "var(--player-panel-shadow)",
      }}
    >
      <div className="flex gap-4">
        <TrackInfoLayout track={track} variant="cover" size={86} />

        <div className="flex flex-col justify-center">
          <TrackInfoLayout track={track} variant="title" />
          <TrackInfoLayout track={track} variant="artist" />
        </div>
      </div>

      <div className="flex items-center justify-center">
        <PlayerControls
          isPlaying={isPlaying}
          onTogglePlaying={(playing) => setState((s) => (s ? { ...s, is_playing: playing } : s))}
        />
      </div>

      <div className="-mt-7">
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

export default LayoutB;
