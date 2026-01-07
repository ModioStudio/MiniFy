import { PauseCircle, PlayCircle, SkipBack, SkipForward } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { getActiveProvider, getActiveProviderType } from "../../../providers";
import { getLastPlayedForProvider } from "../../../hooks/useCurrentlyPlaying";

type TrackControlsProps = {
  isPlaying: boolean;
  currentTrackUri?: string | null;
  onTogglePlaying?: (playing: boolean) => void;
  className?: string;
};

export function TrackControls({ isPlaying, currentTrackUri, onTogglePlaying, className = "" }: TrackControlsProps) {
  const handlePrev = useCallback(async () => {
    const provider = await getActiveProvider();
    provider.previousTrack();
  }, []);

  const handleNext = useCallback(async () => {
    const provider = await getActiveProvider();
    provider.nextTrack();
  }, []);

  const handleToggle = useCallback(async () => {
    const previous = isPlaying;
    const next = !isPlaying;
    onTogglePlaying?.(next);
    
    try {
      const provider = await getActiveProvider();
      const providerType = await getActiveProviderType();
      
      if (next) {
        const playbackState = await provider.getPlaybackState();
        const hasActiveTrack = playbackState?.track !== null;
        
        if (!hasActiveTrack) {
          const cached = await getLastPlayedForProvider(providerType);
          if (cached) {
            await provider.playTrack(cached.track.uri, cached.progress_ms);
            return;
          }
        }
        
        await provider.play();
      } else {
        await provider.pause();
      }
    } catch (error) {
      console.error("Playback toggle failed:", error);
      onTogglePlaying?.(previous);
    }
  }, [isPlaying, onTogglePlaying]);

  const buttonStyle = {
    cursor: "pointer",
    background: "transparent",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };

  const [hovered, setHovered] = useState({
    prev: false,
    play: false,
    next: false,
  });

  const getIconColor = (type: "prev" | "play" | "next") =>
    hovered[type] ? "var(--player-controls-color-active)" : "var(--player-controls-color)";

  return (
    <div className={`flex items-center gap-0 ${className}`}>
      {/* Previous */}
      <button
        type="button"
        onClick={handlePrev}
        aria-label="Previous"
        style={buttonStyle}
        onMouseEnter={() => setHovered((s) => ({ ...s, prev: true }))}
        onMouseLeave={() => setHovered((s) => ({ ...s, prev: false }))}
      >
        <SkipBack size={36} weight="fill" color={getIconColor("prev")} />
      </button>

      {/* Play / Pause */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={isPlaying ? "Pause" : "Play"}
        style={{ ...buttonStyle, width: 72, height: 72 }}
        onMouseEnter={() => setHovered((s) => ({ ...s, play: true }))}
        onMouseLeave={() => setHovered((s) => ({ ...s, play: false }))}
      >
        {isPlaying ? (
          <PauseCircle size={40} weight="fill" color={getIconColor("play")} />
        ) : (
          <PlayCircle size={40} weight="fill" color={getIconColor("play")} />
        )}
      </button>

      {/* Next */}
      <button
        type="button"
        onClick={handleNext}
        aria-label="Next"
        style={buttonStyle}
        onMouseEnter={() => setHovered((s) => ({ ...s, next: true }))}
        onMouseLeave={() => setHovered((s) => ({ ...s, next: false }))}
      >
        <SkipForward size={36} weight="fill" color={getIconColor("next")} />
      </button>
    </div>
  );
}

export default TrackControls;
