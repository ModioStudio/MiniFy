import { getActiveProvider, getActiveProviderType } from "../../providers";
import type { MusicProviderType, UnifiedTrack } from "../../providers/types";
import { usePlaybackQueueStore } from "./playbackQueueStore";

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let lastTrackedVideoId: string | null = null;

export async function startPlaylistPlayback(
  playlistId: string,
  tracks: UnifiedTrack[],
  startIndex: number
): Promise<void> {
  const providerType = await getActiveProviderType();
  const store = usePlaybackQueueStore.getState();

  store.setPlaylistQueue(playlistId, tracks, startIndex, providerType);

  if (providerType === "youtube") {
    const provider = await getActiveProvider();
    const startTrack = tracks[startIndex];
    if (startTrack) {
      await provider.playTrack(startTrack.uri);
      lastTrackedVideoId = startTrack.id;
      startYouTubeQueueMonitor();
    }
  }
}

export async function playSingleTrack(track: UnifiedTrack): Promise<void> {
  const providerType = await getActiveProviderType();
  const store = usePlaybackQueueStore.getState();
  const provider = await getActiveProvider();

  store.setSingleTrack(track, providerType);
  await provider.playTrack(track.uri);

  if (providerType === "youtube") {
    lastTrackedVideoId = track.id;
  }
}

export function clearPlaybackQueue(): void {
  stopYouTubeQueueMonitor();
  usePlaybackQueueStore.getState().clear();
  lastTrackedVideoId = null;
}

function startYouTubeQueueMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  monitorInterval = setInterval(async () => {
    try {
      const store = usePlaybackQueueStore.getState();
      const providerType = await getActiveProviderType();

      if (providerType !== "youtube") {
        stopYouTubeQueueMonitor();
        return;
      }

      const provider = await getActiveProvider();
      const playbackState = await provider.getPlaybackState();

      if (!playbackState) return;

      const { track, isPlaying, progressMs } = playbackState;
      const durationMs = track?.durationMs ?? 0;

      const isNearEnd = durationMs > 0 && progressMs >= durationMs - 2000;
      const isEnded = !isPlaying && isNearEnd;

      if (isEnded && store.getRemainingCount() > 0) {
        const nextTrack = store.advanceToNext();
        if (nextTrack) {
          lastTrackedVideoId = nextTrack.id;
          await provider.playTrack(nextTrack.uri);
        }
      } else if (track && track.id !== lastTrackedVideoId) {
        lastTrackedVideoId = track.id;

        const trackIndex = store.tracks.findIndex((t) => t.id === track.id);
        if (trackIndex !== -1 && trackIndex !== store.currentIndex) {
          usePlaybackQueueStore.setState({ currentIndex: trackIndex });
        }
      }
    } catch (err) {
      console.error("YouTube queue monitor error:", err);
    }
  }, 2000);
}

function stopYouTubeQueueMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

export function getPlaybackQueueState(): {
  isActive: boolean;
  isPlaylistMode: boolean;
  currentIndex: number;
  totalTracks: number;
  provider: MusicProviderType | null;
} {
  const store = usePlaybackQueueStore.getState();
  return {
    isActive: store.tracks.length > 0,
    isPlaylistMode: store.isPlaylistMode,
    currentIndex: store.currentIndex,
    totalTracks: store.tracks.length,
    provider: store.provider,
  };
}
