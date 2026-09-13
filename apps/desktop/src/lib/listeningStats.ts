import { fetchRecentlyPlayed, fetchTopTracks } from "../ui/spotifyClient";

export type ArtistShare = {
  name: string;
  plays: number;
  share: number;
};

export type ListeningStats = {
  artists: ArtistShare[];
  totalPlays: number;
};

const SAMPLE_SIZE = 50;
const TOP_ARTISTS = 5;

/**
 * Counts plays per artist over the listener's recent and most-played tracks.
 *
 * Genres would be the more interesting cut, but Spotify dropped the `genres`
 * field from artist objects and retired every endpoint that carried it, so the
 * honest remaining measure is who gets played.
 */
export async function fetchListeningStats(): Promise<ListeningStats> {
  const [top, recent] = await Promise.all([
    fetchTopTracks("medium_term", SAMPLE_SIZE).catch(() => []),
    fetchRecentlyPlayed(SAMPLE_SIZE).catch(() => []),
  ]);

  const tracks = [...top, ...recent];
  if (tracks.length === 0) return { artists: [], totalPlays: 0 };

  // Only the lead artist counts: crediting every feature would let a handful of
  // crowded collaborations outrank an artist the listener actually plays.
  const counts = new Map<string, number>();
  for (const track of tracks) {
    const lead = track.artists[0]?.name;
    if (!lead) continue;
    counts.set(lead, (counts.get(lead) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_ARTISTS);

  const total = tracks.length;

  return {
    artists: ranked.map(([name, plays]) => ({ name, plays, share: plays / total })),
    totalPlays: total,
  };
}
