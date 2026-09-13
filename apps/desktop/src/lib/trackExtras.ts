import { searchYouTubeVideos } from "../providers/youtube/client";
import { fetchAlbum } from "../ui/spotifyClient";

export type AlbumFacts = {
  name: string;
  releaseDate: string | null;
  totalTracks: number | null;
  label: string | null;
  url: string | null;
};

export type MusicVideo = {
  videoId: string;
  title: string;
  channel: string;
};

const albumCache = new Map<string, AlbumFacts | null>();
const videoCache = new Map<string, MusicVideo | null>();

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

/**
 * Finds the track's video on YouTube.
 *
 * Spotify exposes no video of its own, and the YouTube Data API needs the
 * user's own connection, so this stays empty until YouTube is linked in
 * Settings. Results are cached per track because each search costs 100 units of
 * a 10,000-unit daily quota.
 */
export async function fetchMusicVideo(
  trackId: string,
  trackName: string,
  artistName: string
): Promise<MusicVideo | null> {
  const cached = videoCache.get(trackId);
  if (cached !== undefined) return cached;

  let video: MusicVideo | null = null;
  try {
    const results = await searchYouTubeVideos(`${artistName} ${trackName} official video`, 1);
    const first = results[0];
    if (first) {
      video = {
        videoId: typeof first.id === "string" ? first.id : (first.id?.videoId ?? ""),
        title: first.snippet.title,
        channel: first.snippet.channelTitle,
      };
      if (!video.videoId) video = null;
    }
  } catch {
    // No YouTube connection, or the quota is spent.
    video = null;
  }

  videoCache.set(trackId, video);
  return video;
}

export function youtubeSearchUrl(trackName: string, artistName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${artistName} ${trackName}`
  )}`;
}
