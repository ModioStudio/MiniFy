import { invoke } from "@tauri-apps/api/core";
import { ensureActiveDevice } from "../../lib/playback/spotifyKeepAlive";
import {
  activateSpotifyWebPlayback,
  getSpotifyLocalPlayback,
  isSpotifyWebPlaybackReady,
  nextSpotifyWebPlaybackTrack,
  pauseSpotifyWebPlayback,
  previousSpotifyWebPlaybackTrack,
  resumeSpotifyWebPlayback,
  seekSpotifyWebPlayback,
  setSpotifyWebPlaybackVolume,
} from "../../lib/spotifyWebPlayback";
import type {
  MusicProvider,
  PlaybackState,
  PlaylistsResult,
  PlaylistTracksResult,
  ProviderCapabilities,
  UnifiedTrack,
  UnifiedUserProfile,
} from "../types";
import {
  addTrackToPlaylist,
  fetchCurrentlyPlaying,
  fetchPlaylistTracks,
  fetchRecentlyPlayed,
  fetchUserPlaylists,
  fetchUserProfile,
  playlistTrackTotal,
  type SimplifiedTrack,
  addToQueue as spotifyAddToQueue,
  nextTrack as spotifyNextTrack,
  pause as spotifyPause,
  play as spotifyPlay,
  playPlaylistContext as spotifyPlayPlaylistContext,
  playTrack as spotifyPlayTrack,
  previousTrack as spotifyPreviousTrack,
  searchTracks as spotifySearchTracks,
  seek as spotifySeek,
  setVolume as spotifySetVolume,
} from "./client";

function convertToUnifiedTrack(track: SimplifiedTrack): UnifiedTrack {
  return {
    playlistKey: track.playlistKey,
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
    await invoke("start_oauth_flow");
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
    // When MiniFy is the playing device the SDK already pushes state to us, so
    // prefer it: it is exact, free, and does not burn a Web API call every poll.
    const local = getSpotifyLocalPlayback();
    if (isSpotifyWebPlaybackReady() && local?.track) {
      const drift = local.paused ? 0 : Date.now() - local.sampledAt;
      return {
        isPlaying: !local.paused,
        progressMs: Math.min(local.durationMs, local.positionMs + drift),
        track: convertToUnifiedTrack(local.track),
      };
    }

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

  async getUserProfile(): Promise<UnifiedUserProfile> {
    const profile = await fetchUserProfile();
    return {
      id: profile.id,
      name: profile.display_name || profile.id,
      imageUrl: profile.images?.[0]?.url ?? null,
      provider: "spotify",
      subtitle: profile.product ? `${profile.product} account` : "Spotify account",
    };
  }

  async play(): Promise<void> {
    if (isSpotifyWebPlaybackReady()) {
      // activateElement has to run while the user gesture is still on the
      // stack, so it is called first and not awaited before resume.
      void activateSpotifyWebPlayback();
      await resumeSpotifyWebPlayback();
      return;
    }
    await spotifyPlay();
  }

  async pause(): Promise<void> {
    if (isSpotifyWebPlaybackReady()) {
      await pauseSpotifyWebPlayback();
      return;
    }
    await spotifyPause();
  }

  async nextTrack(): Promise<void> {
    if (isSpotifyWebPlaybackReady()) {
      await nextSpotifyWebPlaybackTrack();
      return;
    }
    await spotifyNextTrack();
  }

  async previousTrack(): Promise<void> {
    if (isSpotifyWebPlaybackReady()) {
      await previousSpotifyWebPlaybackTrack();
      return;
    }
    await spotifyPreviousTrack();
  }

  async seek(positionMs: number): Promise<void> {
    if (isSpotifyWebPlaybackReady()) {
      await seekSpotifyWebPlayback(positionMs);
      return;
    }
    await spotifySeek(positionMs);
  }

  async setVolume(volumePercent: number): Promise<void> {
    if (isSpotifyWebPlaybackReady()) {
      await setSpotifyWebPlaybackVolume(volumePercent);
      return;
    }
    await spotifySetVolume(volumePercent);
  }

  async searchTracks(query: string, limit: number): Promise<UnifiedTrack[]> {
    const tracks = await spotifySearchTracks(query, limit);
    return tracks.map(convertToUnifiedTrack);
  }

  async playTrack(uri: string, startPositionMs?: number): Promise<void> {
    void activateSpotifyWebPlayback().catch(() => {});
    if (!isSpotifyWebPlaybackReady()) {
      // Nothing local to play on: make sure some Connect device is awake,
      // otherwise Spotify answers 404 and the track silently never starts.
      await ensureActiveDevice();
    }
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
      hasExternalPlayback: false,
      hasConnectDevices: true,
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
        writable: p.owner?.id === userProfile.id || p.collaborative === true,
        id: p.id,
        name: p.name,
        description: p.description,
        images: (p.images ?? []).map((img) => ({
          url: img.url,
          width: img.width ?? 300,
          height: img.height ?? 300,
        })),
        trackCount: playlistTrackTotal(p),
        owner: {
          id: p.owner?.id ?? "",
          name: p.owner?.display_name || p.owner?.id || "Spotify",
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

  async playPlaylistFromIndex(
    playlistId: string,
    trackIndex: number,
    trackUri?: string
  ): Promise<void> {
    await spotifyPlayPlaylistContext(playlistId, trackIndex, trackUri);
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
