import { invoke } from "@tauri-apps/api/core";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_BUFFER_MS = 60_000;

export interface YouTubeTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function getYouTubeAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - TOKEN_BUFFER_MS) {
    return cachedToken;
  }

  const tokens = await invoke<YouTubeTokens>("get_youtube_tokens");
  cachedToken = tokens.access_token;
  tokenExpiresAt = tokens.expires_at * 1000;
  return cachedToken;
}

export async function refreshYouTubeToken(): Promise<string> {
  const tokens = await invoke<YouTubeTokens>("refresh_youtube_access_token");
  cachedToken = tokens.access_token;
  tokenExpiresAt = tokens.expires_at * 1000;
  return cachedToken;
}

export function clearYouTubeTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

const pendingRequests = new Map<string, Promise<unknown>>();

async function youtubeRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const cacheKey = `${init?.method ?? "GET"}:${url}`;

  if (!init?.method || init.method === "GET") {
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
      return pending as Promise<T>;
    }
  }

  const doRequest = async (): Promise<T> => {
    let token = await getYouTubeAccessToken();
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
      token = await refreshYouTubeToken();
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

export interface YouTubeVideoSnippet {
  title: string;
  description: string;
  channelTitle: string;
  thumbnails: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
    maxres?: { url: string; width: number; height: number };
  };
}

export interface YouTubeVideoContentDetails {
  duration: string;
}

export interface YouTubeVideoItem {
  id: string | { videoId: string };
  snippet: YouTubeVideoSnippet;
  contentDetails?: YouTubeVideoContentDetails;
}

export interface YouTubeSearchResponse {
  items: YouTubeVideoItem[];
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  nextPageToken?: string;
}

export interface YouTubeVideoListResponse {
  items: YouTubeVideoItem[];
}

function parseIsoDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

export function getVideoIdFromItem(item: YouTubeVideoItem): string {
  if (typeof item.id === "string") {
    return item.id;
  }
  return item.id.videoId;
}

export async function searchYouTubeVideos(
  query: string,
  maxResults: number
): Promise<YouTubeVideoItem[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    videoCategoryId: "10",
    maxResults: maxResults.toString(),
  });

  const searchResponse = await youtubeRequest<YouTubeSearchResponse>(
    `https://www.googleapis.com/youtube/v3/search?${params}`
  );

  if (!searchResponse.items || searchResponse.items.length === 0) {
    return [];
  }

  const videoIds = searchResponse.items
    .map((item) => getVideoIdFromItem(item))
    .join(",");

  const videoParams = new URLSearchParams({
    part: "snippet,contentDetails",
    id: videoIds,
  });

  const videoResponse = await youtubeRequest<YouTubeVideoListResponse>(
    `https://www.googleapis.com/youtube/v3/videos?${videoParams}`
  );

  return videoResponse.items;
}

export async function getVideoDetails(
  videoId: string
): Promise<YouTubeVideoItem | null> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    id: videoId,
  });

  const response = await youtubeRequest<YouTubeVideoListResponse>(
    `https://www.googleapis.com/youtube/v3/videos?${params}`
  );

  return response.items[0] || null;
}

export function videoItemToTrackData(item: YouTubeVideoItem) {
  const videoId = getVideoIdFromItem(item);
  const durationMs = item.contentDetails
    ? parseIsoDuration(item.contentDetails.duration)
    : 0;

  const thumbnails = item.snippet.thumbnails;
  const bestThumbnail =
    thumbnails.maxres ||
    thumbnails.high ||
    thumbnails.medium ||
    thumbnails.default;

  return {
    id: videoId,
    name: item.snippet.title,
    artists: [item.snippet.channelTitle],
    album: "YouTube Music",
    albumArt: bestThumbnail?.url || "",
    durationMs,
    uri: `youtube:video:${videoId}`,
  };
}

export async function getRelatedVideos(
  videoId: string,
  maxResults: number
): Promise<YouTubeVideoItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    relatedToVideoId: videoId,
    type: "video",
    videoCategoryId: "10",
    maxResults: maxResults.toString(),
  });

  try {
    const response = await youtubeRequest<YouTubeSearchResponse>(
      `https://www.googleapis.com/youtube/v3/search?${params}`
    );

    if (!response.items || response.items.length === 0) {
      return [];
    }

    const videoIds = response.items
      .map((item) => getVideoIdFromItem(item))
      .join(",");

    const videoParams = new URLSearchParams({
      part: "snippet,contentDetails",
      id: videoIds,
    });

    const videoResponse = await youtubeRequest<YouTubeVideoListResponse>(
      `https://www.googleapis.com/youtube/v3/videos?${videoParams}`
    );

    return videoResponse.items;
  } catch {
    return [];
  }
}

export interface YouTubePlaylistSnippet {
  title: string;
  description: string;
  thumbnails: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
    maxres?: { url: string; width: number; height: number };
  };
  channelTitle: string;
}

export interface YouTubePlaylistContentDetails {
  itemCount: number;
}

export interface YouTubePlaylistItem {
  id: string;
  snippet: YouTubePlaylistSnippet;
  contentDetails: YouTubePlaylistContentDetails;
}

export interface YouTubePlaylistsResponse {
  items: YouTubePlaylistItem[];
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  nextPageToken?: string;
}

export interface YouTubePlaylistItemSnippet {
  title: string;
  description: string;
  thumbnails: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
    maxres?: { url: string; width: number; height: number };
  };
  channelTitle: string;
  resourceId: {
    kind: string;
    videoId: string;
  };
}

export interface YouTubePlaylistItemResource {
  id: string;
  snippet: YouTubePlaylistItemSnippet;
  contentDetails?: {
    videoId: string;
  };
}

export interface YouTubePlaylistItemsResponse {
  items: YouTubePlaylistItemResource[];
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  nextPageToken?: string;
}

export async function fetchYouTubeUserPlaylists(
  maxResults: number,
  pageToken?: string
): Promise<{ playlists: YouTubePlaylistItem[]; total: number; nextPageToken?: string }> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    mine: "true",
    maxResults: maxResults.toString(),
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const response = await youtubeRequest<YouTubePlaylistsResponse>(
    `https://www.googleapis.com/youtube/v3/playlists?${params}`
  );

  return {
    playlists: response.items || [],
    total: response.pageInfo.totalResults,
    nextPageToken: response.nextPageToken,
  };
}

export async function fetchYouTubePlaylistItems(
  playlistId: string,
  maxResults: number,
  pageToken?: string
): Promise<{ items: YouTubePlaylistItemResource[]; total: number; nextPageToken?: string }> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    playlistId,
    maxResults: maxResults.toString(),
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const response = await youtubeRequest<YouTubePlaylistItemsResponse>(
    `https://www.googleapis.com/youtube/v3/playlistItems?${params}`
  );

  return {
    items: response.items || [],
    total: response.pageInfo.totalResults,
    nextPageToken: response.nextPageToken,
  };
}

export async function addVideoToYouTubePlaylist(
  playlistId: string,
  videoId: string
): Promise<void> {
  await youtubeRequest<YouTubePlaylistItemResource>(
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
    {
      method: "POST",
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId,
          },
        },
      }),
    }
  );
}

export function playlistItemToTrackData(item: YouTubePlaylistItemResource) {
  const videoId = item.snippet.resourceId.videoId;
  const thumbnails = item.snippet.thumbnails;
  const bestThumbnail =
    thumbnails.maxres ||
    thumbnails.high ||
    thumbnails.medium ||
    thumbnails.default;

  return {
    id: videoId,
    name: item.snippet.title,
    artists: [item.snippet.channelTitle],
    album: "YouTube Music",
    albumArt: bestThumbnail?.url || "",
    durationMs: 0,
    uri: `youtube:video:${videoId}`,
  };
}