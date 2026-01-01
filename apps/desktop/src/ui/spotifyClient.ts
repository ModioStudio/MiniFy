import { invoke } from "@tauri-apps/api/core";

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

export interface SimplifiedArtist {
  id: string;
  name: string;
}

export interface SimplifiedAlbum {
  id: string;
  name: string;
  images: Array<{ url: string; height: number; width: number }>;
}

export interface SimplifiedTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: SimplifiedArtist[];
  album: SimplifiedAlbum;
}

export interface CurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: SimplifiedTrack | null;
}

async function getAccessToken(): Promise<string> {
  const tokens = await invoke<{ access_token: string }>("get_tokens");
  return tokens.access_token;
}

async function refreshToken(): Promise<string> {
  const tokens = await invoke<{ access_token: string }>("refresh_access_token");
  return tokens.access_token;
}

async function request<T>(url: string, init?: FetchOptions): Promise<T> {
  let token = await getAccessToken();
  let res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    token = await refreshToken();
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

export async function fetchCurrentlyPlaying(): Promise<CurrentlyPlaying> {
  const data = await request<CurrentlyPlaying>(
    "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track"
  );
  return data;
}

export async function play(): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player/play", { method: "PUT" });
}

export async function pause(): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player/pause", { method: "PUT" });
}

export async function nextTrack(): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player/next", { method: "POST" });
}

export async function previousTrack(): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player/previous", { method: "POST" });
}

export async function seek(positionMs: number): Promise<void> {
  const url = `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.max(0, Math.floor(positionMs))}`;
  await request<void>(url, { method: "PUT" });
}

export async function saveTrackToLibrary(trackId: string): Promise<void> {
  const url = `https://api.spotify.com/v1/me/tracks?ids=${encodeURIComponent(trackId)}`;
  await request<void>(url, { method: "PUT" });
}

export function getLargestImageUrl(images: SimplifiedAlbum["images"]): string | null {
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => b.width - a.width);
  return sorted[0]?.url ?? null;
}

interface SpotifySearchResponse {
  tracks: {
    items: SimplifiedTrack[];
    total: number;
  };
}

export async function searchTracks(query: string, limit: number): Promise<SimplifiedTrack[]> {
  if (!query.trim()) return [];

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const data = await request<SpotifySearchResponse>(url);
  return data.tracks.items;
}

export async function playTrack(trackUri: string): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

interface RecentlyPlayedResponse {
  items: Array<{
    track: SimplifiedTrack;
    played_at: string;
  }>;
}

export async function fetchRecentlyPlayed(limit: number): Promise<SimplifiedTrack[]> {
  const url = `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`;
  const data = await request<RecentlyPlayedResponse>(url);

  const seen = new Set<string>();
  const uniqueTracks: SimplifiedTrack[] = [];

  for (const item of data.items) {
    if (!seen.has(item.track.id)) {
      seen.add(item.track.id);
      uniqueTracks.push(item.track);
    }
  }

  return uniqueTracks;
}

export type TimeRange = "short_term" | "medium_term" | "long_term";

export interface FullArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  images: Array<{ url: string; height: number; width: number }>;
}

interface TopTracksResponse {
  items: SimplifiedTrack[];
  total: number;
}

interface TopArtistsResponse {
  items: FullArtist[];
  total: number;
}

export async function fetchTopTracks(
  timeRange: TimeRange,
  limit: number
): Promise<SimplifiedTrack[]> {
  const url = `https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=${limit}`;
  const data = await request<TopTracksResponse>(url);
  return data.items;
}

export async function fetchTopArtists(
  timeRange: TimeRange,
  limit: number
): Promise<FullArtist[]> {
  const url = `https://api.spotify.com/v1/me/top/artists?time_range=${timeRange}&limit=${limit}`;
  const data = await request<TopArtistsResponse>(url);
  return data.items;
}

export interface AudioFeatures {
  id: string;
  danceability: number;
  energy: number;
  key: number;
  loudness: number;
  mode: number;
  speechiness: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  valence: number;
  tempo: number;
  duration_ms: number;
  time_signature: number;
}

interface AudioFeaturesResponse {
  audio_features: Array<AudioFeatures | null>;
}

export async function fetchAudioFeatures(trackIds: string[]): Promise<AudioFeatures[]> {
  if (trackIds.length === 0) return [];
  const ids = trackIds.slice(0, 100).join(",");
  const url = `https://api.spotify.com/v1/audio-features?ids=${ids}`;
  const data = await request<AudioFeaturesResponse>(url);
  return data.audio_features.filter((f): f is AudioFeatures => f !== null);
}

export interface SpotifyRecommendation {
  tracks: SimplifiedTrack[];
}

export interface RecommendationParams {
  seedTracks?: string[];
  seedArtists?: string[];
  seedGenres?: string[];
  targetEnergy?: number;
  targetDanceability?: number;
  targetValence?: number;
  limit?: number;
}

function extractTrackId(trackIdOrUri: string): string {
  if (trackIdOrUri.startsWith("spotify:track:")) {
    return trackIdOrUri.replace("spotify:track:", "");
  }
  return trackIdOrUri;
}

export async function fetchRecommendations(
  params: RecommendationParams
): Promise<SimplifiedTrack[]> {
  const urlParams = new URLSearchParams();

  if (params.seedTracks?.length) {
    const cleanIds = params.seedTracks.slice(0, 5).map(extractTrackId);
    urlParams.set("seed_tracks", cleanIds.join(","));
  }
  if (params.seedArtists?.length) {
    urlParams.set("seed_artists", params.seedArtists.slice(0, 5).join(","));
  }
  if (params.seedGenres?.length) {
    urlParams.set("seed_genres", params.seedGenres.slice(0, 5).join(","));
  }
  if (params.targetEnergy !== undefined) {
    urlParams.set("target_energy", params.targetEnergy.toString());
  }
  if (params.targetDanceability !== undefined) {
    urlParams.set("target_danceability", params.targetDanceability.toString());
  }
  if (params.targetValence !== undefined) {
    urlParams.set("target_valence", params.targetValence.toString());
  }
  urlParams.set("limit", (params.limit ?? 10).toString());

  const url = `https://api.spotify.com/v1/recommendations?${urlParams.toString()}`;
  const data = await request<SpotifyRecommendation>(url);
  return data.tracks ?? [];
}

export interface UserProfile {
  id: string;
  display_name: string;
  country: string;
  product: string;
  followers: { total: number };
}

export async function fetchUserProfile(): Promise<UserProfile> {
  const url = "https://api.spotify.com/v1/me";
  return request<UserProfile>(url);
}

export interface SavedTracksResponse {
  total: number;
  items: Array<{ track: SimplifiedTrack }>;
}

export async function fetchSavedTracksCount(): Promise<number> {
  const url = "https://api.spotify.com/v1/me/tracks?limit=1";
  const data = await request<SavedTracksResponse>(url);
  return data.total;
}