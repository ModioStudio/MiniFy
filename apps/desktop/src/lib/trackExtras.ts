import { fetchAlbum } from "../ui/spotifyClient";

export type AlbumFacts = {
  name: string;
  releaseDate: string | null;
  totalTracks: number | null;
  label: string | null;
  url: string | null;
};

const albumCache = new Map<string, AlbumFacts | null>();

export async function fetchAlbumFacts(albumId: string): Promise<AlbumFacts | null> {
  if (!albumId) return null;

  const cached = albumCache.get(albumId);
  if (cached !== undefined) return cached;

  let facts: AlbumFacts | null = null;
  try {
    const album = await fetchAlbum(albumId);
    facts = {
      name: album.name,
      releaseDate: album.release_date ?? null,
      totalTracks: album.total_tracks ?? null,
      label: album.label ?? album.copyrights?.[0]?.text ?? null,
      url: album.external_urls?.spotify ?? null,
    };
  } catch {
    facts = null;
  }

  albumCache.set(albumId, facts);
  return facts;
}
