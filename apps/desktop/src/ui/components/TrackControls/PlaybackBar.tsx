import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveProvider } from "../../../providers";

type PlaybackBarProps = {
  durationMs: number;
  progressMs: number | null;
  isPlaying: boolean;
  onSeek?: (ms: number) => void;
  className?: string;
  /**
   * "stacked" puts the timestamps above the bar, which is what the mini player
   * needs in its narrow layout. "inline" puts them either side, so the whole
   * transport stays one row high in the desktop player bar.
   */
  variant?: "stacked" | "inline";
};

function msToTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function seekToPosition(ms: number): Promise<void> {
  try {
    const provider = await getActiveProvider();
    await provider.seek(ms);
  } catch (error) {
    console.error("Failed to seek to position:", ms, error);
  }
}

export function PlaybackBar({
  durationMs,
  progressMs,
  isPlaying,
  onSeek,
  className = "",
  variant = "stacked",
}: PlaybackBarProps) {
  const [localProgress, setLocalProgress] = useState(progressMs ?? 0);
  const lastTick = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current && typeof progressMs === "number") {
      setLocalProgress(progressMs);
    }
  }, [progressMs]);

  useEffect(() => {
    if (!isPlaying) {
      lastTick.current = null;
      return;
    }
    let frame: number;
    const loop = (t: number) => {
      if (dragging.current) {
        frame = requestAnimationFrame(loop);
        return;
      }
      if (lastTick.current == null) lastTick.current = t;
      const dt = t - lastTick.current;
      lastTick.current = t;
      setLocalProgress((p) => Math.min(durationMs, p + dt));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, durationMs]);

  const pct = useMemo(
    () => (durationMs > 0 ? (localProgress / durationMs) * 100 : 0),
    [localProgress, durationMs]
  );

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
      const ratio = rect.width > 0 ? x / rect.width : 0;
      const newMs = Math.floor(ratio * durationMs);
      setLocalProgress(newMs);
      seekToPosition(newMs);
      onSeek?.(newMs);
    },
    [durationMs, onSeek]
  );

  const startDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
      const ratio = rect.width > 0 ? x / rect.width : 0;
      const newMs = Math.floor(ratio * durationMs);
      setLocalProgress(newMs);
    },
    [durationMs]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      handlePointer(e);
    },
    [handlePointer]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        const newMs = Math.max(0, localProgress - 5000);
        setLocalProgress(newMs);
        seekToPosition(newMs);
        onSeek?.(newMs);
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        const newMs = Math.min(durationMs, localProgress + 5000);
        setLocalProgress(newMs);
        seekToPosition(newMs);
        onSeek?.(newMs);
      }
    },
    [localProgress, durationMs, onSeek]
  );

  const elapsedLabel = (
    <span className="playbar-time text-(--player-playbar-time-color) tabular-nums font-circular">
      {msToTime(localProgress)}
    </span>
  );
  const totalLabel = (
    <span className="playbar-time text-(--player-playbar-time-color) tabular-nums font-circular">
      {msToTime(durationMs)}
    </span>
  );

  const track = (
    <div
      className="relative h-2 w-full rounded-full cursor-pointer select-none"
      style={{ background: "var(--player-playbar-track-bg)" }}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={durationMs}
      aria-valuenow={localProgress}
      aria-valuetext={`${msToTime(localProgress)} of ${msToTime(durationMs)}`}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onClick={handlePointer}
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute left-0 top-0 h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: "var(--player-playbar-track-fill)",
        }}
      />
      <div
        className="playbar-thumb absolute top-1/2 -translate-y-1/2 -ml-1 h-3 w-3 rounded-full"
        style={{
          left: `${pct}%`,
          background: "var(--player-playbar-thumb-color)",
        }}
      />
    </div>
  );

  if (variant === "inline") {
    return (
      <div className={`playbar playbar-inline ${className}`}>
        {elapsedLabel}
        {track}
        {totalLabel}
      </div>
    );
  }

  return (
    <div className={`playbar playbar-stacked flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between">
        {elapsedLabel}
        {totalLabel}
      </div>
      {track}
    </div>
  );
}

export default PlaybackBar;
