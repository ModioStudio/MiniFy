import { invoke } from "@tauri-apps/api/core";
import type {
  MusicProvider,
  PlaybackState,
  PlaylistsResult,
  PlaylistTracksResult,
  ProviderCapabilities,
  UnifiedTrack,
} from "../types";
import {
  addTrackToPlaylist,
  fetchCurrentlyPlaying,
  fetchPlaylistTracks,
  fetchRecentlyPlayed,
  fetchUserPlaylists,
  fetchUserProfile,
  type SimplifiedTrack,
  addToQueue as spotifyAddToQueue,
  nextTrack as spotifyNextTrack,
  pause as spotifyPause,
  play as spotifyPlay,
  playTrack as spotifyPlayTrack,
  previousTrack as spotifyPreviousTrack,
  searchTracks as spotifySearchTracks,
  seek as spotifySeek,
  setVolume as spotifySetVolume,
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

  async playTrack(uri: string, startPositionMs?: number): Promise<void> {
    await spotifyPlayTrack(uri, startPositionMs);
  }

  async addToQueue(uri: string): Promise<void> {
    await spotifyAddToQueue(uri);
  }

  async getRecentlyPlayed(limit: number): Promise<UnifiedTrack[]> {
    const tracks = await fetchRecentlyPlayed(limit);
    return tracks.map(convertToUnifiedTrack);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      hasPlaylists: true,
      hasQueue: true,
      hasExternalPlayback: true,
      hasLikedSongs: true,
    };
  }

  async getUserPlaylists(limit: number, offset: number): Promise<PlaylistsResult> {
    const [response, userProfile] = await Promise.all([
      fetchUserPlaylists(limit, offset),
      fetchUserProfile(),
    ]);
    return {
      playlists: response.playlists.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        images: (p.images ?? []).map((img) => ({
          url: img.url,
          width: img.width ?? 300,
          height: img.height ?? 300,
        })),
        trackCount: p.tracks.total,
        owner: {
          id: p.owner.id,
          name: p.owner.display_name,
        },
      })),
      total: response.total,
      currentUserId: userProfile.id,
    };
  }

  async getPlaylistTracks(
    playlistId: string,
    limit: number,
    offset: number
  ): Promise<PlaylistTracksResult> {
    const response = await fetchPlaylistTracks(playlistId, limit, offset);
    return {
      tracks: response.tracks.map(convertToUnifiedTrack),
      total: response.total,
    };
  }

  async addToPlaylist(playlistId: string, trackUri: string): Promise<void> {
    await addTrackToPlaylist(playlistId, trackUri);
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
