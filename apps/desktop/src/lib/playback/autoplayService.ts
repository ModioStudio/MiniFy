import { getActiveProvider, getActiveProviderType } from "../../providers";
import type { UnifiedTrack } from "../../providers/types";
import { getRelatedVideos, videoItemToTrackData } from "../../providers/youtube/client";
import {
  addToQueue as spotifyAddToQueue,
  fetchRecommendations,
  getQueue as spotifyGetQueue,
} from "../../ui/spotifyClient";
import { useAIQueueStore } from "../aiQueueStore";
import { usePlaybackQueueStore } from "./playbackQueueStore";

interface AutoplayState {
  enabled: boolean;
  lastProcessedTrackId: string | null;
  pendingAutoplayTracks: string[];
}

const state: AutoplayState = {
  enabled: true,
  lastProcessedTrackId: null,
  pendingAutoplayTracks: [],
};

let autoplayMonitorInterval: ReturnType<typeof setInterval> | null = null;

export function setAutoplayEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (enabled) {
    startAutoplayMonitor();
  } else {
    stopAutoplayMonitor();
  }
}

export function isAutoplayEnabled(): boolean {
  return state.enabled;
}

export function startAutoplayMonitor(): void {
  if (autoplayMonitorInterval) return;

  autoplayMonitorInterval = setInterval(async () => {
    if (!state.enabled) return;

    try {
      await checkAndTriggerAutoplay();
    } catch (err) {
      console.error("Autoplay monitor error:", err);
    }
  }, 5000);
}

export function stopAutoplayMonitor(): void {
  if (autoplayMonitorInterval) {
    clearInterval(autoplayMonitorInterval);
    autoplayMonitorInterval = null;
  }
}

async function checkAndTriggerAutoplay(): Promise<void> {
  const aiQueueState = useAIQueueStore.getState();
  if (aiQueueState.isActive) {
    return;
  }

  const providerType = await getActiveProviderType();
  const provider = await getActiveProvider();
  const playbackState = await provider.getPlaybackState();

  if (!playbackState?.track) return;

  const { track, isPlaying, progressMs } = playbackState;
  const durationMs = track.durationMs;

  if (track.id === state.lastProcessedTrackId) return;

  const isNearEnd = durationMs > 0 && progressMs >= durationMs - 10000;

  if (!isNearEnd) return;

  if (providerType === "spotify") {
    await handleSpotifyAutoplay(track);
  } else if (providerType === "youtube") {
    await handleYouTubeAutoplay(track, isPlaying, progressMs, durationMs);
  }

  state.lastProcessedTrackId = track.id;
}

async function handleSpotifyAutoplay(currentTrack: UnifiedTrack): Promise<void> {
  try {
    const queue = await spotifyGetQueue();

    if (queue.queue.length > 0) {
      return;
    }

    const recommendations = await fetchRecommendations({
      seedTracks: [currentTrack.id],
      limit: 10,
    });

    if (recommendations.length === 0) return;

    for (const track of recommendations.slice(0, 5)) {
      const uri = `spotify:track:${track.id}`;
      await spotifyAddToQueue(uri);
      state.pendingAutoplayTracks.push(track.id);
    }
  } catch (err) {
    console.error("Spotify autoplay failed:", err);
  }
}

async function handleYouTubeAutoplay(
  currentTrack: UnifiedTrack,
  isPlaying: boolean,
  progressMs: number,
  durationMs: number
): Promise<void> {
  const playbackQueue = usePlaybackQueueStore.getState();

  if (playbackQueue.getRemainingCount() > 0) {
    return;
  }

  const isEnded = !isPlaying && progressMs >= durationMs - 2000;
  if (!isEnded) return;

  try {
    const videoId = currentTrack.id;
    const relatedVideos = await getRelatedVideos(videoId, 10);

    if (relatedVideos.length === 0) return;

    const nextVideo = relatedVideos[0];
    const trackData = videoItemToTrackData(nextVideo);

    const nextTrack: UnifiedTrack = {
      id: trackData.id,
      name: trackData.name,
      durationMs: trackData.durationMs,
      artists: trackData.artists.map((name, idx) => ({ id: `yt-artist-${idx}`, name })),
      album: {
        id: "youtube-music",
        name: trackData.album,
        images: trackData.albumArt ? [{ url: trackData.albumArt, width: 640, height: 640 }] : [],
      },
      uri: trackData.uri,
      provider: "youtube",
    };

    playbackQueue.appendTracks([nextTrack]);

    const provider = await getActiveProvider();
    await provider.playTrack(nextTrack.uri);
  } catch (err) {
    console.error("YouTube autoplay failed:", err);
  }
}

export function resetAutoplayState(): void {
  state.lastProcessedTrackId = null;
  state.pendingAutoplayTracks = [];
}
