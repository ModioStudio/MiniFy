import { useEffect, useState } from "react";

const CLOCK_TICK_MS = 200;

/**
 * Playback position advanced locally between reports. The shell only learns
 * the position from a 2.5s poll and SDK events; read raw, anything that
 * follows the song (lyrics, the music video) lags up to a full poll behind.
 */
export function useLiveProgress(
  progressMs: number,
  isPlaying: boolean,
  durationMs: number
): number {
  const [live, setLive] = useState(progressMs);

  useEffect(() => {
    setLive(progressMs);
    if (!isPlaying) return;

    const anchoredAt = performance.now();
    const end = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
    const id = window.setInterval(() => {
      setLive(Math.min(end, progressMs + performance.now() - anchoredAt));
    }, CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, [progressMs, isPlaying, durationMs]);

  return live;
}
