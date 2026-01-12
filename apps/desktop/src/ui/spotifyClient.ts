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

// Token cache to avoid repeated Tauri invocations
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_BUFFER_MS = 60_000; // Refresh 1 min before expiry

// Request deduplication for concurrent identical requests
const pendingRequests = new Map<string, Promise<unknown>>();

export function clearSpotifyTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
  pendingRequests.clear();
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - TOKEN_BUFFER_MS) {
    return cachedToken;
  }

  const tokens = await invoke<{ access_token: string; expires_in?: number }>("get_tokens");
  cachedToken = tokens.access_token;
  tokenExpiresAt = now + (tokens.expires_in ?? 3600) * 1000;
  return cachedToken;
}

async function refreshToken(): Promise<string> {
  const tokens = await invoke<{ access_token: string; expires_in?: number }>(
    "refresh_access_token"
  );
  cachedToken = tokens.access_token;
  tokenExpiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  return cachedToken;
}

async function request<T>(url: string, init?: FetchOptions): Promise<T> {
  const cacheKey = `${init?.method ?? "GET"}:${url}:${init?.body ?? ""}`;

  // Only dedupe GET requests
  if (!init?.method || init.method === "GET") {
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
      return pending as Promise<T>;
    }
  }

  const doRequest = async (): Promise<T> => {
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
      cachedToken = null;
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
  };

  const promise = doRequest();

  if (!init?.method || init.method === "GET") {
    pendingRequests.set(cacheKey, promise);
    promise.finally(() => pendingRequests.delete(cacheKey));
  }

  return promise;
}

// Fire-and-forget for player commands (non-blocking)
function fireAndForget(url: string, init?: FetchOptions): void {
  request<void>(url, init).catch((err) => {
    console.warn("Player command failed:", err);
  });
}

export async function fetchCurrentlyPlaying(): Promise<CurrentlyPlaying> {
  const data = await request<CurrentlyPlaying>(
    "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track"
  );
  return data;
}

export function play(): void {
  fireAndForget("https://api.spotify.com/v1/me/player/play", { method: "PUT" });
}

export function pause(): void {
  fireAndForget("https://api.spotify.com/v1/me/player/pause", { method: "PUT" });
}

export function nextTrack(): void {
  fireAndForget("https://api.spotify.com/v1/me/player/next", { method: "POST" });
}

export function previousTrack(): void {
  fireAndForget("https://api.spotify.com/v1/me/player/previous", { method: "POST" });
}

// Debounced seek to avoid flooding API during scrubbing
let seekTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSeekPosition = 0;

// Debounced volume to avoid flooding API during slider adjustment
let volumeTimeout: ReturnType<typeof setTimeout> | null = null;
let lastVolumeValue = 0;

export interface PlayerDevice {
  id: string;
  name: string;
  type: string;
  volume_percent: number;
  is_active: boolean;
}

export interface PlayerState {
  device: PlayerDevice;
  is_playing: boolean;
  progress_ms: number | null;
  item: SimplifiedTrack | null;
}

export async function getPlayerState(): Promise<PlayerState | null> {
  try {
    const data = await request<PlayerState>("https://api.spotify.com/v1/me/player");
    return data;
  } catch {
    return null;
  }
}

export function setVolume(volumePercent: number): void {
  lastVolumeValue = Math.max(0, Math.min(100, Math.round(volumePercent)));

  if (volumeTimeout) {
    clearTimeout(volumeTimeout);
  }

  volumeTimeout = setTimeout(() => {
    fireAndForget(`https://api.spotify.com/v1/me/player/volume?volume_percent=${lastVolumeValue}`, {
      method: "PUT",
    });
    volumeTimeout = null;
  }, 50);
}

export function seek(positionMs: number): void {
  lastSeekPosition = Math.max(0, Math.floor(positionMs));

  if (seekTimeout) {
    clearTimeout(seekTimeout);
  }

  seekTimeout = setTimeout(() => {
    const url = `https://api.spotify.com/v1/me/player/seek?position_ms=${lastSeekPosition}`;
    fireAndForget(url, { method: "PUT" });
    seekTimeout = null;
  }, 100);
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

export async function playTrack(trackUri: string, positionMs?: number): Promise<void> {
  const body: { uris: string[]; position_ms?: number } = { uris: [trackUri] };
  if (positionMs !== undefined && positionMs > 0) {
    body.position_ms = positionMs;
  }
  await request<void>("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    body: JSON.stringify(body),
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

export async function fetchTopArtists(timeRange: TimeRange, limit: number): Promise<FullArtist[]> {
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

export async function addToQueue(trackUri: string): Promise<void> {
  const url = `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}`;
  await request<void>(url, { method: "POST" });
}

export async function playTracks(trackUris: string[]): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    body: JSON.stringify({ uris: trackUris }),
  });
}

export interface SimplifiedPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: Array<{ url: string; height: number | null; width: number | null }>;
  owner: {
    id: string;
    display_name: string;
  };
  tracks: {
    total: number;
  };
}

interface UserPlaylistsResponse {
  items: SimplifiedPlaylist[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchUserPlaylists(
  limit: number,
  offset: number
): Promise<{ playlists: SimplifiedPlaylist[]; total: number }> {
  const url = `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`;
  const data = await request<UserPlaylistsResponse>(url);
  return { playlists: data.items, total: data.total };
}

interface PlaylistTracksResponse {
  items: Array<{
    track: SimplifiedTrack | null;
    added_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export async function fetchPlaylistTracks(
  playlistId: string,
  limit: number,
  offset: number
): Promise<{ tracks: SimplifiedTrack[]; total: number }> {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`;
  const data = await request<PlaylistTracksResponse>(url);
  const tracks = data.items
    .filter((item) => item.track !== null)
    .map((item) => item.track as SimplifiedTrack);
  return { tracks, total: data.total };
}

export async function addTrackToPlaylist(playlistId: string, trackUri: string): Promise<void> {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  await request<{ snapshot_id: string }>(url, {
    method: "POST",
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

export async function playPlaylistContext(
  playlistId: string,
  offset: number
): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    body: JSON.stringify({
      context_uri: `spotify:playlist:${playlistId}`,
      offset: { position: offset },
    }),
  });
}

export async function playAlbumContext(albumId: string, offset: number): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    body: JSON.stringify({
      context_uri: `spotify:album:${albumId}`,
      offset: { position: offset },
    }),
  });
}

interface DevicesResponse {
  devices: PlayerDevice[];
}

export async function getDevices(): Promise<PlayerDevice[]> {
  const data = await request<DevicesResponse>("https://api.spotify.com/v1/me/player/devices");
  return data.devices ?? [];
}

export async function transferPlayback(deviceId: string, play: boolean): Promise<void> {
  await request<void>("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
}

export async function getQueue(): Promise<{ currently_playing: SimplifiedTrack | null; queue: SimplifiedTrack[] }> {
  const data = await request<{ currently_playing: SimplifiedTrack | null; queue: SimplifiedTrack[] }>(
    "https://api.spotify.com/v1/me/player/queue"
  );
  return data;
}