import { PauseCircle, PlayCircle, SkipBack, SkipForward } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { nextTrack, pause, play, previousTrack } from "../../spotifyClient";

type TrackControlsProps = {
  isPlaying: boolean;
  onTogglePlaying?: (playing: boolean) => void;
  className?: string;
};

export function TrackControls({ isPlaying, onTogglePlaying, className = "" }: TrackControlsProps) {
  const [busy, setBusy] = useState(false);

  const handlePrev = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await previousTrack();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handleNext = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await nextTrack();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handleToggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = !isPlaying;
      onTogglePlaying?.(next);
      if (next) {
        await play();
      } else {
        await pause();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, isPlaying, onTogglePlaying]);

  return (
    <div className={`flex items-center gap-0 ${className}`}>
      <button
        type="button"
        onClick={handlePrev}
        aria-label="Previous"
        className="cursor-pointer text-white/90 hover:text-white rounded-full w-16 h-16 flex items-center justify-center active:scale-[0.98] focus:outline-none"
      >
        <SkipBack size={36} weight="fill" />
      </button>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="cursor-pointer text-white rounded-full w-[72px] h-[72px] flex items-center justify-center active:scale-[0.98] focus:outline-none"
      >
        {isPlaying ? (
          <PauseCircle size={40} weight="fill" />
        ) : (
          <PlayCircle size={40} weight="fill" />
        )}
      </button>
      <button
        type="button"
        onClick={handleNext}
        aria-label="Next"
        className="cursor-pointer text-white/90 hover:text-white rounded-full w-16 h-16 flex items-center justify-center active:scale-[0.98] focus:outline-none"
      >
        <SkipForward size={36} weight="fill" />
      </button>
    </div>
  );
}

export default TrackControls;
