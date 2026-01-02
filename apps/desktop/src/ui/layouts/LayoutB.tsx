import { PlusCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useCurrentlyPlaying } from "../../hooks/useCurrentlyPlaying";
import useWindowLayout from "../../hooks/useWindowLayout";
import { TrackInfoLayout } from "../components/LayoutTrackInfo/TrackInfoLayout";
import PlaybackBar from "../components/TrackControls/PlaybackBar";
import PlayerControls from "../components/TrackControls/TrackControls";

type LayoutBProps = {
  onAddToPlaylist?: (trackId: string, trackName: string) => void;
};

function LayoutB({ onAddToPlaylist }: LayoutBProps) {
  const { setLayout } = useWindowLayout();
  const { track, isPlaying, progress, duration, setState } = useCurrentlyPlaying();
  const [plusHovered, setPlusHovered] = useState<boolean>(false);

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
      <div className="flex gap-4 items-center">
        <TrackInfoLayout track={track} variant="cover" size={86} />

        <div className="flex flex-col justify-center flex-1 min-w-0">
          <TrackInfoLayout track={track} variant="title" />
          <TrackInfoLayout track={track} variant="artist" />
        </div>

        <button
          type="button"
          onClick={() => {
            if (track && onAddToPlaylist) {
              onAddToPlaylist(track.id, track.name);
            }
          }}
          disabled={!track || !onAddToPlaylist}
          aria-label="Add to playlist"
          className="w-8 h-8 flex items-center justify-center active:scale-[0.95] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          onMouseEnter={() => setPlusHovered(true)}
          onMouseLeave={() => setPlusHovered(false)}
        >
          <PlusCircle
            size={24}
            weight="fill"
            color={plusHovered ? "var(--player-controls-color-active)" : "var(--player-controls-color)"}
          />
        </button>
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
