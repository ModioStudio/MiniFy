import { getActiveProvider, getActiveProviderType } from "../../providers";
import type { UnifiedTrack } from "../../providers/types";
import { getRelatedVideos, videoItemToTrackData } from "../../providers/youtube/client";
import { useAIQueueStore } from "../aiQueueStore";
import { usePlaybackQueueStore } from "./playbackQueueStore";
import { startSpotifyAutoplay, stopSpotifyAutoplay } from "./spotifyAutoplay";

interface AutoplayState {
  enabled: boolean;
  lastProcessedTrackId: string | null;
}

const state: AutoplayState = {
  enabled: true,
  lastProcessedTrackId: null,
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
  // Spotify has its own event-driven controller; see spotifyAutoplay.ts.
  startSpotifyAutoplay();

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
  stopSpotifyAutoplay();

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

  if ((await getActiveProviderType()) !== "youtube") return;

  const provider = await getActiveProvider();
  const playbackState = await provider.getPlaybackState();

  if (!playbackState?.track) return;

  const { track, isPlaying, progressMs } = playbackState;
  const durationMs = track.durationMs;

  if (track.id === state.lastProcessedTrackId) return;

  const isNearEnd = durationMs > 0 && progressMs >= durationMs - 10000;
  if (!isNearEnd) return;

  // Only marked done once it actually is: marking a track while it was still
  // playing its last seconds used to switch autoplay off for it for good.
  if (await handleYouTubeAutoplay(track, isPlaying, progressMs, durationMs)) {
    state.lastProcessedTrackId = track.id;
  }
}

/** True when nothing more needs doing for this track. */
async function handleYouTubeAutoplay(
  currentTrack: UnifiedTrack,
  isPlaying: boolean,
  progressMs: number,
  durationMs: number
): Promise<boolean> {
  const playbackQueue = usePlaybackQueueStore.getState();

  if (playbackQueue.getRemainingCount() > 0) {
    return true;
  }

  const isEnded = !isPlaying && progressMs >= durationMs - 2000;
  if (!isEnded) return false;

  try {
    const videoId = currentTrack.id;
    const relatedVideos = await getRelatedVideos(videoId, 10);

    if (relatedVideos.length === 0) return false;

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
    return true;
  } catch (err) {
    console.error("YouTube autoplay failed:", err);
    return false;
  }
}

export function resetAutoplayState(): void {
  state.lastProcessedTrackId = null;
}
