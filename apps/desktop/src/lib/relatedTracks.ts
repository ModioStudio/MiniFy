import {
  fetchPlaylistTracks,
  fetchRecentlyPlayed,
  fetchTopTracks,
  fetchUserPlaylists,
  playlistTrackTotal,
  type SimplifiedPlaylist,
  type SimplifiedTrack,
  searchTracks,
} from "../ui/spotifyClient";

/**
 * Stands in for Spotify's `/v1/recommendations`, which now answers 404 for apps
 * registered after the November 2024 cutoff. Related artists, artist top tracks
 * and audio features went the same way, and playlists found through search are
 * 403, so the only material left to build a radio from is: the artist's own
 * catalogue (via search), the listener's library, and their own playlists.
 */

export type RelatedSeed = {
  /** Artists of the track being extended. The strongest signal available. */
  artistNames?: string[];
  /** Free-form genre words; Spotify still honours `genre:` in search. */
  genres?: string[];
  /** Track ids already played or queued, so the radio does not repeat itself. */
  excludeTrackIds?: string[];
};

const ARTIST_SEEDS = 2;
const ARTIST_PAGE = 10;
const LIBRARY_PAGE = 30;
const PLAYLIST_SAMPLE = 2;
const PLAYLIST_PAGE = 50;
const PLAYLIST_CACHE_MS = 5 * 60 * 1000;

let playlistCache: { at: number; playlists: SimplifiedPlaylist[] } | null = null;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

async function settled<T>(task: Promise<T[]>): Promise<T[]> {
  try {
    return await task;
  } catch {
    // A dead endpoint or a playlist Spotify will not expose must not take the
    // whole radio down with it.
    return [];
  }
}

/** The artist's own catalogue — what "more like this" degrades to these days. */
async function fromArtists(artistNames: string[]): Promise<SimplifiedTrack[]> {
  const seeds = shuffle(artistNames).slice(0, ARTIST_SEEDS);
  const pages = await Promise.all(
    seeds.map((name) => settled(searchTracks(`artist:"${name}"`, ARTIST_PAGE)))
  );
  return pages.flat();
}

async function fromGenres(genres: string[]): Promise<SimplifiedTrack[]> {
  const seeds = shuffle(genres).slice(0, ARTIST_SEEDS);
  const pages = await Promise.all(
    seeds.map((genre) => settled(searchTracks(`genre:${genre}`, ARTIST_PAGE)))
  );
  return pages.flat();
}

async function fromLibrary(): Promise<SimplifiedTrack[]> {
  const [top, recent] = await Promise.all([
    settled(fetchTopTracks("medium_term", LIBRARY_PAGE)),
    settled(fetchRecentlyPlayed(LIBRARY_PAGE)),
  ]);
  return [...top, ...recent];
}

async function readablePlaylists(): Promise<SimplifiedPlaylist[]> {
  if (playlistCache && Date.now() - playlistCache.at < PLAYLIST_CACHE_MS) {
    return playlistCache.playlists;
  }

  try {
    const { playlists } = await fetchUserPlaylists(50, 0);
    const usable = playlists.filter((playlist) => playlistTrackTotal(playlist) > 0);
    playlistCache = { at: Date.now(), playlists: usable };
    return usable;
  } catch {
    return [];
  }
}

/** Dips into a random slice of the listener's own playlists for variety. */
async function fromPlaylists(): Promise<SimplifiedTrack[]> {
  const playlists = await readablePlaylists();
  if (playlists.length === 0) return [];

  const picks = shuffle(playlists).slice(0, PLAYLIST_SAMPLE);
  const pages = await Promise.all(
    picks.map(async (playlist) => {
      const total = playlistTrackTotal(playlist);
      const maxOffset = Math.max(0, total - PLAYLIST_PAGE);
      const offset = maxOffset > 0 ? Math.floor(Math.random() * maxOffset) : 0;
      const response = await fetchPlaylistTracks(playlist.id, PLAYLIST_PAGE, offset);
      return response.tracks;
    })
  );

  return pages.flat();
}

/**
 * Builds a shuffled batch of tracks that fit the seed, mixing the artist's
 * catalogue with the listener's own music so a long session does not turn into
 * a single-artist loop.
 */
export async function fetchRelatedTracks(
  seed: RelatedSeed,
  limit: number
): Promise<SimplifiedTrack[]> {
  const [artistTracks, genreTracks, libraryTracks, playlistTracks] = await Promise.all([
    seed.artistNames?.length ? fromArtists(seed.artistNames) : Promise.resolve([]),
    seed.genres?.length ? fromGenres(seed.genres) : Promise.resolve([]),
    settled(fromLibrary()),
    settled(fromPlaylists()),
  ]);

  const excluded = new Set(seed.excludeTrackIds ?? []);
  const seen = new Set<string>();
  const picked: SimplifiedTrack[] = [];

  // Interleaved rather than concatenated: taking one from each pool in turn
  // keeps the artist's catalogue up front without crowding everything else out.
  const pools = [
    shuffle(artistTracks),
    shuffle(genreTracks),
    shuffle(playlistTracks),
    shuffle(libraryTracks),
  ];

  for (let round = 0; picked.length < limit; round++) {
    const exhausted = pools.every((pool) => round >= pool.length);
    if (exhausted) break;

    for (const pool of pools) {
      const track = pool[round];
      if (!track || excluded.has(track.id) || seen.has(track.id)) continue;
      seen.add(track.id);
      picked.push(track);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

/** Drops the cached playlist list, e.g. after signing in as someone else. */
export function clearRelatedTracksCache(): void {
  playlistCache = null;
}
