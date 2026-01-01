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
