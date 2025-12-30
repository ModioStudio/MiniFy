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
      <div className="grid grid-cols-[auto_1fr] gap-4 h-full">
        <div className="flex flex-col gap-2">
          <TrackInfoLayout track={track} variant="cover" size={96} />

          <div className="mt-10">
            <TrackInfoLayout track={track} variant="title" maxLength={20} />
            <TrackInfoLayout track={track} variant="artist" maxLength={20} />
          </div>
        </div>

        <div className="-ml-14 w-auto mt-5">
          <PlaybackBar
            durationMs={duration}
            progressMs={progress}
            isPlaying={isPlaying}
            onSeek={(ms) => setState((s) => (s ? { ...s, progress_ms: ms } : s))}
          />
        </div>

        <div className="flex justify-end">
          <PlayerControls
            isPlaying={isPlaying}
            onTogglePlaying={(playing) => setState((s) => (s ? { ...s, is_playing: playing } : s))}
          />
        </div>
      </div>
    </div>
  );
}

export default LayoutC;
