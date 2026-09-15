import { getActiveProvider, getActiveProviderType } from "../../providers";
import type { MusicProviderType, UnifiedTrack } from "../../providers/types";
import { usePlaybackQueueStore } from "./playbackQueueStore";

export async function startPlaylistPlayback(
  playlistId: string,
  tracks: UnifiedTrack[],
  startIndex: number
): Promise<void> {
  const providerType = await getActiveProviderType();
  const store = usePlaybackQueueStore.getState();

  store.setPlaylistQueue(playlistId, tracks, startIndex, providerType);
  const provider = await getActiveProvider();
  const startTrack = tracks[startIndex];
  if (startTrack) {
    await provider.playTrack(startTrack.uri);
  }
}

export async function playSingleTrack(track: UnifiedTrack): Promise<void> {
  const providerType = await getActiveProviderType();
  const store = usePlaybackQueueStore.getState();
  const provider = await getActiveProvider();

  store.setSingleTrack(track, providerType);
  await provider.playTrack(track.uri);
}

export function clearPlaybackQueue(): void {
  usePlaybackQueueStore.getState().clear();
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
