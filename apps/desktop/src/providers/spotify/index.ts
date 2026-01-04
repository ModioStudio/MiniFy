import { invoke } from "@tauri-apps/api/core";
import type {
  MusicProvider,
  UnifiedTrack,
  PlaybackState,
} from "../types";
import {
  fetchCurrentlyPlaying,
  play as spotifyPlay,
  pause as spotifyPause,
  nextTrack as spotifyNextTrack,
  previousTrack as spotifyPreviousTrack,
  seek as spotifySeek,
  setVolume as spotifySetVolume,
  searchTracks as spotifySearchTracks,
  playTrack as spotifyPlayTrack,
  addToQueue as spotifyAddToQueue,
  fetchRecentlyPlayed,
  type SimplifiedTrack,
} from "./client";

function convertToUnifiedTrack(track: SimplifiedTrack): UnifiedTrack {
  return {
    id: track.id,
    name: track.name,
    durationMs: track.duration_ms,
    artists: track.artists.map((a) => ({ id: a.id, name: a.name })),
    album: {
      id: track.album.id,
      name: track.album.name,
      images: track.album.images,
    },
    uri: `spotify:track:${track.id}`,
    provider: "spotify",
  };
}

class SpotifyProviderImpl implements MusicProvider {
  readonly type = "spotify" as const;

  async isAuthenticated(): Promise<boolean> {
    try {
      await invoke("get_tokens");
      return true;
    } catch {
      return false;
    }
  }

  async connect(): Promise<void> {
    await invoke("start_spotify_auth");
  }

  async disconnect(): Promise<void> {
    await invoke("clear_credentials");
  }

  async getCurrentTrack(): Promise<UnifiedTrack | null> {
    try {
      const data = await fetchCurrentlyPlaying();
      if (!data?.item) return null;
      return convertToUnifiedTrack(data.item);
    } catch {
      return null;
    }
  }

  async getPlaybackState(): Promise<PlaybackState | null> {
    try {
      const data = await fetchCurrentlyPlaying();
      if (!data) return null;
      return {
        isPlaying: data.is_playing,
        progressMs: data.progress_ms ?? 0,
        track: data.item ? convertToUnifiedTrack(data.item) : null,
      };
    } catch {
      return null;
    }
  }

  play(): void {
    spotifyPlay();
  }

  pause(): void {
    spotifyPause();
  }

  nextTrack(): void {
    spotifyNextTrack();
  }

  previousTrack(): void {
    spotifyPreviousTrack();
  }

  seek(positionMs: number): void {
    spotifySeek(positionMs);
  }

  setVolume(volumePercent: number): void {
    spotifySetVolume(volumePercent);
  }

  async searchTracks(query: string, limit: number): Promise<UnifiedTrack[]> {
    const tracks = await spotifySearchTracks(query, limit);
    return tracks.map(convertToUnifiedTrack);
  }

  async playTrack(uri: string): Promise<void> {
    await spotifyPlayTrack(uri);
  }

  async addToQueue(uri: string): Promise<void> {
    await spotifyAddToQueue(uri);
  }

  async getRecentlyPlayed(limit: number): Promise<UnifiedTrack[]> {
    const tracks = await fetchRecentlyPlayed(limit);
    return tracks.map(convertToUnifiedTrack);
  }
}

let instance: SpotifyProviderImpl | null = null;

export function createSpotifyProvider(): MusicProvider {
  if (!instance) {
    instance = new SpotifyProviderImpl();
  }
  return instance;
}

export { convertToUnifiedTrack };
