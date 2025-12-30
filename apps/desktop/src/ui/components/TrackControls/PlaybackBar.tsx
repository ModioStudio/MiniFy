import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seek } from "../../spotifyClient";

type PlaybackBarProps = {
  durationMs: number;
  progressMs: number | null;
  isPlaying: boolean;
  onSeek?: (ms: number) => void;
  className?: string;
};

function msToTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlaybackBar({
  durationMs,
  progressMs,
  isPlaying,
  onSeek,
  className = "",
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
    async (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
      const ratio = rect.width > 0 ? x / rect.width : 0;
      const newMs = Math.floor(ratio * durationMs);
      setLocalProgress(newMs);
      await seek(newMs);
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
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      await handlePointer(e);
    },
    [handlePointer]
  );

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-(--player-playbar-time-color) text-base tabular-nums font-circular italic">
          {msToTime(localProgress)}
        </span>
        <span className="text-(--player-playbar-time-color) text-base tabular-nums font-circular italic">
          {msToTime(durationMs)}
        </span>
      </div>
      <div
        className="relative h-2 w-full rounded-full cursor-pointer select-none"
        style={{ background: "var(--player-playbar-track-bg)" }}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={localProgress}
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onClick={handlePointer}
        onKeyDown={async (e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            const newMs = Math.max(0, localProgress - 5000);
            setLocalProgress(newMs);
            await seek(newMs);
            onSeek?.(newMs);
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            const newMs = Math.min(durationMs, localProgress + 5000);
            setLocalProgress(newMs);
            await seek(newMs);
            onSeek?.(newMs);
          }
        }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full    "
          style={{
            width: `${pct}%`,
            background: "var(--player-playbar-track-fill)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -ml-1 h-3 w-3 rounded-full shadow"
          style={{
            left: `${pct}%`,
            background: "var(--player-playbar-thumb-color)",
          }}
        />
      </div>
    </div>
  );
}

export default PlaybackBar;
