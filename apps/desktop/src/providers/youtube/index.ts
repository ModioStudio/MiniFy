import { invoke } from "@tauri-apps/api/core";
import type {
  MusicProvider,
  UnifiedTrack,
  PlaybackState,
  ProviderCapabilities,
  PlaylistsResult,
  PlaylistTracksResult,
} from "../types";
import {
  searchYouTubeVideos,
  videoItemToTrackData,
  getVideoDetails,
  fetchYouTubeUserPlaylists,
  fetchYouTubePlaylistItems,
  addVideoToYouTubePlaylist,
  playlistItemToTrackData,
} from "./client";
import type { YouTubePlayerRef } from "../../ui/components/YouTubePlayer";

let playerRef: YouTubePlayerRef | null = null;
let currentTrack: UnifiedTrack | null = null;
let recentlyPlayedTracks: UnifiedTrack[] = [];
const MAX_RECENT_TRACKS = 50;

export function setYouTubePlayerRef(ref: YouTubePlayerRef | null): void {
  playerRef = ref;
}

export function getYouTubePlayerRef(): YouTubePlayerRef | null {
  return playerRef;
}

export function clearYouTubeState(): void {
  currentTrack = null;
  if (playerRef) {
    playerRef.stop();
  }
}

function convertToUnifiedTrack(data: ReturnType<typeof videoItemToTrackData>): UnifiedTrack {
  return {
    id: data.id,
    name: data.name,
    durationMs: data.durationMs,
    artists: data.artists.map((name, idx) => ({ id: `yt-artist-${idx}`, name })),
    album: {
      id: "youtube-music",
      name: data.album,
      images: data.albumArt
        ? [{ url: data.albumArt, width: 640, height: 640 }]
        : [],
    },
    uri: data.uri,
    provider: "youtube",
  };
}

function addToRecentlyPlayed(track: UnifiedTrack): void {
  recentlyPlayedTracks = recentlyPlayedTracks.filter((t) => t.id !== track.id);
  recentlyPlayedTracks.unshift(track);
  if (recentlyPlayedTracks.length > MAX_RECENT_TRACKS) {
    recentlyPlayedTracks = recentlyPlayedTracks.slice(0, MAX_RECENT_TRACKS);
  }
}

class YouTubeProviderImpl implements MusicProvider {
  readonly type = "youtube" as const;

  async isAuthenticated(): Promise<boolean> {
    try {
      const hasTokens = await invoke<boolean>("has_valid_youtube_tokens");
      return hasTokens;
    } catch {
      return false;
    }
  }

  async connect(): Promise<void> {
    await invoke("start_youtube_oauth_flow");
  }

  async disconnect(): Promise<void> {
    await invoke("clear_youtube_credentials");
    currentTrack = null;
    recentlyPlayedTracks = [];
  }

  async getCurrentTrack(): Promise<UnifiedTrack | null> {
    return currentTrack;
  }

  async getPlaybackState(): Promise<PlaybackState | null> {
    if (!playerRef || !playerRef.isReady()) {
      return null;
    }

    const state = playerRef.getState();
    return {
      isPlaying: state.isPlaying,
      progressMs: state.currentTime * 1000,
      track: currentTrack,
    };
  }

  play(): void {
    if (!playerRef) return;
    
    // Just resume playback - don't reload the video
    // The video should already be loaded from playTrack()
    playerRef.play();
  }

  pause(): void {
    playerRef?.pause();
  }

  nextTrack(): void {
    console.warn("YouTube Provider: nextTrack not implemented - use AI DJ queue");
  }

  previousTrack(): void {
    console.warn("YouTube Provider: previousTrack not implemented");
  }

  seek(positionMs: number): void {
    playerRef?.seek(positionMs / 1000);
  }

  setVolume(volumePercent: number): void {
    playerRef?.setVolume(volumePercent);
  }

  async searchTracks(query: string, limit: number): Promise<UnifiedTrack[]> {
    const videos = await searchYouTubeVideos(query, limit);
    return videos.map((v) => convertToUnifiedTrack(videoItemToTrackData(v)));
  }

  async playTrack(uri: string, startPositionMs?: number): Promise<void> {
    const videoId = uri.replace("youtube:video:", "");

    const maxAttempts = 50;
    let attempts = 0;
    while ((!playerRef || !playerRef.isReady()) && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!playerRef || !playerRef.isReady()) {
      throw new Error("YouTube player not ready after waiting. Please try again.");
    }

    playerRef.loadVideo(videoId);
    
    // Seek to position if provided
    if (startPositionMs !== undefined && startPositionMs > 0) {
      // Wait a bit for video to load before seeking
      await new Promise((resolve) => setTimeout(resolve, 500));
      playerRef.seek(startPositionMs / 1000);
    }
    
    playerRef.play();

    const details = await getVideoDetails(videoId);
    if (details) {
      currentTrack = convertToUnifiedTrack(videoItemToTrackData(details));
      addToRecentlyPlayed(currentTrack);
    }
  }

  async addToQueue(uri: string): Promise<void> {
    console.warn("YouTube Provider: addToQueue not natively supported - track will be played directly");
    await this.playTrack(uri);
  }

  async getRecentlyPlayed(limit: number): Promise<UnifiedTrack[]> {
    return recentlyPlayedTracks.slice(0, limit);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      hasPlaylists: true,
      hasQueue: false,
      hasExternalPlayback: false,
      hasLikedSongs: false,
    };
  }

  async getUserPlaylists(limit: number, offset: number): Promise<PlaylistsResult> {
    const pagesNeeded = Math.ceil((offset + limit) / 50);
    let allPlaylists: PlaylistsResult["playlists"] = [];
    let total = 0;
    let nextPageToken: string | undefined;

    for (let i = 0; i < pagesNeeded; i++) {
      const response = await fetchYouTubeUserPlaylists(50, nextPageToken);
      total = response.total;
      
      allPlaylists = allPlaylists.concat(
        response.playlists.map((p) => {
          const thumbnails = p.snippet.thumbnails;
          const bestThumb =
            thumbnails.maxres || thumbnails.high || thumbnails.medium || thumbnails.default;
          return {
            id: p.id,
            name: p.snippet.title,
            description: p.snippet.description || null,
            images: bestThumb ? [{ url: bestThumb.url, width: bestThumb.width, height: bestThumb.height }] : [],
            trackCount: p.contentDetails.itemCount,
            owner: {
              id: "youtube-user",
              name: p.snippet.channelTitle,
            },
          };
        })
      );

      nextPageToken = response.nextPageToken;
      if (!nextPageToken) break;
    }

    return {
      playlists: allPlaylists.slice(offset, offset + limit),
      total,
    };
  }

  async getPlaylistTracks(
    playlistId: string,
    limit: number,
    offset: number
  ): Promise<PlaylistTracksResult> {
    const pagesNeeded = Math.ceil((offset + limit) / 50);
    let allTracks: UnifiedTrack[] = [];
    let total = 0;
    let nextPageToken: string | undefined;

    for (let i = 0; i < pagesNeeded; i++) {
      const response = await fetchYouTubePlaylistItems(playlistId, 50, nextPageToken);
      total = response.total;

      const tracks = response.items
        .filter((item) => item.snippet.resourceId.videoId)
        .map((item) => {
          const data = playlistItemToTrackData(item);
          return convertToUnifiedTrack(data);
        });

      allTracks = allTracks.concat(tracks);
      nextPageToken = response.nextPageToken;
      if (!nextPageToken) break;
    }

    return {
      tracks: allTracks.slice(offset, offset + limit),
      total,
    };
  }

  async addToPlaylist(playlistId: string, trackUri: string): Promise<void> {
    const videoId = trackUri.replace("youtube:video:", "");
    await addVideoToYouTubePlaylist(playlistId, videoId);
  }
}

export function updateCurrentYouTubeTrack(data: {
  videoId: string;
  title: string;
  author: string;
  duration: number;
}): void {
  currentTrack = {
    id: data.videoId,
    name: data.title,
    durationMs: data.duration * 1000,
    artists: [{ id: `yt-artist-${data.author}`, name: data.author }],
    album: {
      id: "youtube-music",
      name: "YouTube Music",
      images: [
        {
          url: `https://img.youtube.com/vi/${data.videoId}/maxresdefault.jpg`,
          width: 1280,
          height: 720,
        },
      ],
    },
    uri: `youtube:video:${data.videoId}`,
    provider: "youtube",
  };
  addToRecentlyPlayed(currentTrack);
}

let instance: YouTubeProviderImpl | null = null;

export function createYouTubeProvider(): MusicProvider {
  if (!instance) {
    instance = new YouTubeProviderImpl();
  }
  return instance;
}
