import { invoke } from "@tauri-apps/api/core";
import type {
  MusicProvider,
  UnifiedTrack,
  PlaybackState,
} from "../types";
import {
  searchYouTubeVideos,
  videoItemToTrackData,
  getVideoDetails,
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
    playerRef?.play();
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

  async playTrack(uri: string): Promise<void> {
    const videoId = uri.replace("youtube:video:", "");

    if (!playerRef || !playerRef.isReady()) {
      throw new Error("YouTube player not ready");
    }

    playerRef.loadVideo(videoId);
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
