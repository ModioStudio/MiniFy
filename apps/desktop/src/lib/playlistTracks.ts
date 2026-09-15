import type { MusicProvider, UnifiedTrack } from "../providers/types";

/** Spotify caps playlist item pages at 100. */
export const PLAYLIST_PAGE_SIZE = 100;
/** Pages requested at once after the first; enough to be quick, few enough for Spotify's rate limit. */
const PARALLEL_PAGES = 3;

export type PlaylistPageHandler = (page: {
  tracks: UnifiedTrack[];
  loaded: number;
  total: number;
}) => void;

/**
 * Walks every page of a playlist. The first page tells how many there are, the
 * rest load a few at a time. Pages reach `onPage` strictly in playlist order,
 * so a list filled from them never reshuffles, and `isCancelled` lets a caller
 * abandon a long playlist when the user moves on.
 */
export async function loadAllPlaylistTracks(
  provider: MusicProvider,
  playlistId: string,
  onPage: PlaylistPageHandler,
  isCancelled: () => boolean = () => false
): Promise<UnifiedTrack[]> {
  const first = await provider.getPlaylistTracks(playlistId, PLAYLIST_PAGE_SIZE, 0);
  if (isCancelled()) return first.tracks;
  const total = first.total;
  const all: UnifiedTrack[] = [...first.tracks];
  onPage({ tracks: first.tracks, loaded: all.length, total });

  // Unplayable entries (local files, removed songs) thin out a page, so offsets
  // advance by the page size rather than by what came back.
  const offsets: number[] = [];
  for (let offset = PLAYLIST_PAGE_SIZE; offset < total; offset += PLAYLIST_PAGE_SIZE) {
    offsets.push(offset);
  }
  const pages: (UnifiedTrack[] | undefined)[] = new Array(offsets.length);
  let requested = 0;
  let delivered = 0;
  const deliver = () => {
    for (let page = pages[delivered]; page !== undefined; page = pages[delivered]) {
      all.push(...page);
      delivered++;
      onPage({ tracks: page, loaded: all.length, total });
    }
  };
  const worker = async () => {
    while (requested < offsets.length && !isCancelled()) {
      const index = requested++;
      const response = await provider.getPlaylistTracks(
        playlistId,
        PLAYLIST_PAGE_SIZE,
        offsets[index]
      );
      pages[index] = response.tracks;
      deliver();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_PAGES, offsets.length) }, worker));
  return all;
}
