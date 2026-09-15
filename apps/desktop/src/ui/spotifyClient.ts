import { invoke } from "@tauri-apps/api/core";
import { getSpotifyWebPlaybackDeviceId } from "../lib/spotifyWebPlaybackDevice";

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
  uri?: string;
  playlistKey?: string;
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
type StoredTokens = {
  access_token: string;
  refresh_token: string;
  /** Unix seconds, as persisted by the Rust credential store. */
  expires_at: number;
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
/** Refresh this far ahead of expiry so an in-flight request never races it. */
const TOKEN_BUFFER_MS = 120_000;

// Request deduplication for concurrent identical requests
const pendingRequests = new Map<string, Promise<unknown>>();
let inFlightRefresh: Promise<string> | null = null;

export function clearSpotifyTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
  inFlightRefresh = null;
  pendingRequests.clear();
}

function adoptTokens(tokens: StoredTokens): string {
  cachedToken = tokens.access_token;
  // The backend stores an absolute unix timestamp. Treating it as a relative
  // lifetime (the old behaviour) handed the Web Playback SDK tokens that were
  // already dead, which killed playback mid-track.
  tokenExpiresAt = tokens.expires_at * 1000;
  return cachedToken;
}

export async function getSpotifyAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - TOKEN_BUFFER_MS) {
    return cachedToken;
  }

  if (!cachedToken) {
    const tokens = await invoke<StoredTokens>("get_tokens");
    adoptTokens(tokens);
    if (Date.now() < tokenExpiresAt - TOKEN_BUFFER_MS) {
      return cachedToken as string;
    }
  }

  return refreshToken();
}

export function refreshToken(): Promise<string> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = invoke<StoredTokens>("refresh_access_token")
    .then(adoptTokens)
    .finally(() => {
      inFlightRefresh = null;
    });

  return inFlightRefresh;
}

/** Drops the cached token and mints a new one. Used when Spotify rejects a token. */
export function forceRefreshSpotifyAccessToken(): Promise<string> {
  cachedToken = null;
  tokenExpiresAt = 0;
  return refreshToken();
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
    let token = await getSpotifyAccessToken();
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
    // Not `finally`: its derived promise rejects with nobody listening, so every
    // failed GET was logged as an unhandled rejection even when the caller
    // handled the error.
    const forget = () => pendingRequests.delete(cacheKey);
    promise.then(forget, forget);
  }

  return promise;
}

// Fire-and-forget for player commands (non-blocking)
function fireAndForget(url: string, init?: FetchOptions): void {
  request<void>(url, init).catch((err) => {
    console.warn("Player command failed:", err);
  });
}

/**
 * Pins a player command to MiniFy's own Connect device when it is registered.
 * Without this the command lands on whatever device Spotify last considered
 * active — usually the official desktop client.
 */
function withMinifyDevice(url: string): string {
  const deviceId = getSpotifyWebPlaybackDeviceId();
  if (!deviceId) return url;

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}device_id=${encodeURIComponent(deviceId)}`;
}

export async function fetchCurrentlyPlaying(): Promise<CurrentlyPlaying> {
  const data = await request<CurrentlyPlaying>(
    "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track"
  );
  return data;
}

export function play(): void {
  fireAndForget(withMinifyDevice("https://api.spotify.com/v1/me/player/play"), { method: "PUT" });
}

export function pause(): void {
  fireAndForget(withMinifyDevice("https://api.spotify.com/v1/me/player/pause"), {
    method: "PUT",
  });
}

export function nextTrack(): void {
  fireAndForget(withMinifyDevice("https://api.spotify.com/v1/me/player/next"), { method: "POST" });
}

export function previousTrack(): void {
  fireAndForget(withMinifyDevice("https://api.spotify.com/v1/me/player/previous"), {
    method: "POST",
  });
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
  shuffle_state: boolean;
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
    fireAndForget(
      withMinifyDevice(
        `https://api.spotify.com/v1/me/player/volume?volume_percent=${lastVolumeValue}`
      ),
      {
        method: "PUT",
      }
    );
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
    fireAndForget(withMinifyDevice(url), { method: "PUT" });
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

/** Spotify answers 400 "Invalid limit" for anything above this on /search. */
const SEARCH_PAGE_SIZE = 10;

export async function searchTracks(query: string, limit: number): Promise<SimplifiedTrack[]> {
  if (!query.trim()) return [];

  const encoded = encodeURIComponent(query);
  const pageCount = Math.max(1, Math.ceil(limit / SEARCH_PAGE_SIZE));

  // Pages are independent, so ask for them at once rather than walking offsets
  // one round trip at a time.
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => {
      const offset = index * SEARCH_PAGE_SIZE;
      const url = `https://api.spotify.com/v1/search?q=${encoded}&type=track&limit=${SEARCH_PAGE_SIZE}&offset=${offset}`;
      return request<SpotifySearchResponse>(url).then((data) => data.tracks?.items ?? []);
    })
  );

  // Paged search can repeat a track across offsets; keep the first occurrence so
  // React list keys stay unique.
  const seen = new Set<string>();
  const unique: SimplifiedTrack[] = [];
  for (const track of pages.flat()) {
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    unique.push(track);
  }

  return unique.slice(0, limit);
}

export async function playTrack(trackUri: string, positionMs?: number): Promise<void> {
  const body: { uris: string[]; position_ms?: number } = { uris: [trackUri] };
  if (positionMs !== undefined && positionMs > 0) {
    body.position_ms = positionMs;
  }
  await request<void>(withMinifyDevice("https://api.spotify.com/v1/me/player/play"), {
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
  /** Dropped from artist objects by Spotify; treat as absent. */
  genres?: string[];
  /** Dropped from artist objects by Spotify; treat as absent. */
  popularity?: number;
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

export interface AudioAnalysisBeat {
  start: number;
  duration: number;
  confidence: number;
}

export interface AudioAnalysisSection {
  start: number;
  duration: number;
  confidence: number;
  loudness: number;
  tempo: number;
  tempo_confidence: number;
  key_confidence: number;
  mode_confidence: number;
}

export interface SpotifyAudioAnalysis {
  track: {
    duration: number;
    loudness: number;
    tempo: number;
    tempo_confidence: number;
    time_signature: number;
  };
  beats: AudioAnalysisBeat[];
  sections: AudioAnalysisSection[];
}

interface AudioFeaturesResponse {
  audio_features: Array<AudioFeatures | null>;
}

function extractTrackId(trackIdOrUri: string): string {
  if (trackIdOrUri.startsWith("spotify:track:")) {
    return trackIdOrUri.replace("spotify:track:", "");
  }
  return trackIdOrUri;
}

export async function fetchAudioFeatures(trackIds: string[]): Promise<AudioFeatures[]> {
  if (trackIds.length === 0) return [];
  const ids = trackIds.slice(0, 100).join(",");
  const url = `https://api.spotify.com/v1/audio-features?ids=${ids}`;
  const data = await request<AudioFeaturesResponse>(url);
  return data.audio_features.filter((f): f is AudioFeatures => f !== null);
}

export async function fetchAudioAnalysis(trackIdOrUri: string): Promise<SpotifyAudioAnalysis> {
  const trackId = extractTrackId(trackIdOrUri);
  const url = `https://api.spotify.com/v1/audio-analysis/${trackId}`;
  return request<SpotifyAudioAnalysis>(url);
}

export interface FullAlbum {
  id: string;
  name: string;
  release_date?: string;
  total_tracks?: number;
  label?: string;
  external_urls?: { spotify?: string };
  copyrights?: Array<{ text: string }>;
}

export async function fetchAlbum(albumId: string): Promise<FullAlbum> {
  return request<FullAlbum>(`https://api.spotify.com/v1/albums/${albumId}`);
}

/** Single-artist lookup still works; the batch `/v1/artists?ids=` form is 403. */
export async function fetchArtist(artistId: string): Promise<FullArtist> {
  return request<FullArtist>(`https://api.spotify.com/v1/artists/${artistId}`);
}

export interface UserProfile {
  id: string;
  display_name: string;
  country: string;
  product: string;
  followers: { total: number };
  images: Array<{ url: string; height: number | null; width: number | null }>;
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
  await request<void>(withMinifyDevice(url), { method: "POST" });
}

/** Spotify's shuffle mode on the active device; it carries over to the next context. */
export async function setShuffle(on: boolean): Promise<void> {
  await request<void>(
    withMinifyDevice(`https://api.spotify.com/v1/me/player/shuffle?state=${on}`),
    { method: "PUT" }
  );
}

export async function playTracks(trackUris: string[]): Promise<void> {
  await request<void>(withMinifyDevice("https://api.spotify.com/v1/me/player/play"), {
    method: "PUT",
    body: JSON.stringify({ uris: trackUris }),
  });
}

export interface SimplifiedPlaylist {
  collaborative?: boolean;
  id: string;
  name: string;
  description: string | null;
  images: Array<{ url: string; height: number | null; width: number | null }>;
  owner: {
    id: string;
    display_name?: string | null;
  };
  /** Deprecated by Spotify in favour of `items`; still sent to older apps. */
  tracks?: {
    total: number;
  };
  /** Replaced `tracks` as the track paging stub on simplified playlists. */
  items?: {
    total: number;
  };
}

/**
 * Spotify moved the track total on simplified playlists from `tracks.total` to
 * `items.total`; apps reading only the old field see every playlist as empty.
 */
export function playlistTrackTotal(playlist: SimplifiedPlaylist): number {
  return playlist.items?.total ?? playlist.tracks?.total ?? 0;
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
  const playlists = Array.isArray(data.items) ? data.items : [];
  return { playlists, total: data.total ?? playlists.length };
}

interface PlaylistEntryItem extends SimplifiedTrack {
  /** `episode` for podcast entries, which carry no album/artists. */
  type?: string;
}

interface PlaylistTracksResponse {
  items: Array<{
    /** Deprecated by Spotify in favour of `item`. */
    track?: PlaylistEntryItem | null;
    item?: PlaylistEntryItem | null;
    added_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

/**
 * A playlist's version. Spotify changes it with every edit, so an unchanged
 * one means a stored copy of the songs is still current.
 */
export async function fetchPlaylistSnapshot(playlistId: string): Promise<string> {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}?fields=snapshot_id`;
  const data = await request<{ snapshot_id: string }>(url);
  return data.snapshot_id;
}

export async function fetchPlaylistTracks(
  playlistId: string,
  limit: number,
  offset: number
): Promise<{ tracks: SimplifiedTrack[]; total: number }> {
  // `/tracks` now answers 403 for new apps; `/items` is its live replacement.
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=${limit}&offset=${offset}`;
  const data = await request<PlaylistTracksResponse>(url);
  const tracks = data.items
    .map((entry) => {
      const track = entry.item ?? entry.track ?? null;
      return track
        ? {
            ...track,
            playlistKey: `${track.uri || `spotify:track:${track.id}`}|${entry.added_at ?? ""}`,
          }
        : null;
    })
    .filter(
      (track): track is NonNullable<typeof track> => track !== null && track.type !== "episode"
    );
  return { tracks, total: data.total };
}

export async function addTrackToPlaylist(playlistId: string, trackUri: string): Promise<void> {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/items`;
  await request<{ snapshot_id: string }>(url, {
    method: "POST",
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

export async function playPlaylistContext(
  playlistId: string,
  offset: number,
  trackUri?: string
): Promise<void> {
  await request<void>(withMinifyDevice("https://api.spotify.com/v1/me/player/play"), {
    method: "PUT",
    body: JSON.stringify({
      context_uri: `spotify:playlist:${playlistId}`,
      offset: trackUri ? { uri: trackUri } : { position: offset },
    }),
  });
}

export async function playAlbumContext(albumId: string, offset: number): Promise<void> {
  await request<void>(withMinifyDevice("https://api.spotify.com/v1/me/player/play"), {
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

export async function getQueue(): Promise<{
  currently_playing: SimplifiedTrack | null;
  queue: SimplifiedTrack[];
}> {
  const data = await request<{
    currently_playing: SimplifiedTrack | null;
    queue: SimplifiedTrack[];
  }>("https://api.spotify.com/v1/me/player/queue");
  return data;
}
