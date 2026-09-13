import type { MusicProvider, UnifiedTrack } from "../providers/types";

/** Spotify caps playlist item pages at 100; YouTube tolerates the same ask. */
export const PLAYLIST_PAGE_SIZE = 100;

export type PlaylistPageHandler = (page: {
  tracks: UnifiedTrack[];
  loaded: number;
  total: number;
}) => void;

/**
 * Walks every page of a playlist instead of stopping at the first one. Pages are
 * handed to `onPage` as they arrive so the list fills in while the rest loads,
 * and `isCancelled` lets a caller abandon a long playlist when the user moves on.
 */
export async function loadAllPlaylistTracks(
  provider: MusicProvider,
  playlistId: string,
  onPage: PlaylistPageHandler,
  isCancelled: () => boolean = () => false
): Promise<UnifiedTrack[]> {
  const all: UnifiedTrack[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    if (isCancelled()) break;

    const response = await provider.getPlaylistTracks(playlistId, PLAYLIST_PAGE_SIZE, offset);
    if (isCancelled()) break;

    total = response.total;
    all.push(...response.tracks);
    onPage({ tracks: response.tracks, loaded: all.length, total });

    // An empty page means the playlist holds unplayable entries (local files,
    // removed tracks) that thin out the page. Advance by the page size so the
    // walk still terminates instead of re-requesting the same offset forever.
    offset += PLAYLIST_PAGE_SIZE;
  }

  return all;
}
