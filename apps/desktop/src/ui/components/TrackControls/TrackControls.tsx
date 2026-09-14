import { PauseCircle, PlayCircle, SkipBack, SkipForward } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { getLastPlayedForProvider } from "../../../hooks/useCurrentlyPlaying";
import { skipToNext } from "../../../lib/playback/spotifyAutoplay";
import { getActiveProvider, getActiveProviderType } from "../../../providers";

type TrackControlsProps = {
  isPlaying: boolean;
  currentTrackUri?: string | null;
  onTogglePlaying?: (playing: boolean) => void;
  className?: string;
  /** Trims the play button's hit area so the desktop player bar can stay low. */
  compact?: boolean;
};

/**
 * Starts or pauses playback, resuming the last cached track when nothing is
 * loaded. Shared by the on-screen controls and the Windows taskbar buttons;
 * throws when the provider refuses.
 */
export async function setPlayback(playing: boolean): Promise<void> {
  const provider = await getActiveProvider();
  if (!playing) {
    await provider.pause();
    return;
  }

  const playbackState = await provider.getPlaybackState();
  if (playbackState?.track == null) {
    const cached = await getLastPlayedForProvider(await getActiveProviderType());
    if (cached) {
      await provider.playTrack(cached.track.uri, cached.progress_ms);
      return;
    }
  }

  await provider.play();
}

export function TrackControls({
  isPlaying,
  currentTrackUri: _currentTrackUri,
  onTogglePlaying,
  className = "",
  compact = false,
}: TrackControlsProps) {
  const handlePrev = useCallback(async () => {
    const provider = await getActiveProvider();
    provider.previousTrack();
  }, []);

  // On the last song this continues into autoplay instead of stopping.
  const handleNext = useCallback(() => {
    void skipToNext();
  }, []);

  const handleToggle = useCallback(async () => {
    const previous = isPlaying;
    const next = !isPlaying;
    onTogglePlaying?.(next);

    try {
      await setPlayback(next);
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
        style={{ ...buttonStyle, width: 72, height: compact ? 48 : 72 }}
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
