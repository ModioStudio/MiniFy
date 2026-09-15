export type MusicProviderType = "spotify" | "youtube";

export interface UnifiedArtist {
  id: string;
  name: string;
}

export interface UnifiedAlbumImage {
  url: string;
  height: number;
  width: number;
}

export interface UnifiedAlbum {
  id: string;
  name: string;
  images: UnifiedAlbumImage[];
}

export interface UnifiedTrack {
  playlistKey?: string;
  id: string;
  name: string;
  durationMs: number;
  artists: UnifiedArtist[];
  album: UnifiedAlbum;
  uri: string;
  provider: MusicProviderType;
}

export interface PlaybackState {
  isPlaying: boolean;
  progressMs: number;
  track: UnifiedTrack | null;
}

export interface SearchResult {
  tracks: UnifiedTrack[];
  total: number;
}

export interface UnifiedPlaylistOwner {
  id: string;
  name: string;
}

export interface UnifiedPlaylist {
  writable?: boolean;
  id: string;
  name: string;
  description: string | null;
  images: UnifiedAlbumImage[];
  trackCount: number;
  owner: UnifiedPlaylistOwner;
}

export interface PlaylistsResult {
  playlists: UnifiedPlaylist[];
  total: number;
  currentUserId?: string;
}

export interface PlaylistTracksResult {
  tracks: UnifiedTrack[];
  total: number;
}

export interface ProviderCapabilities {
  hasPlaylists: boolean;
  hasQueue: boolean;
  hasExternalPlayback: boolean;
  hasLikedSongs: boolean;
  /** Provider exposes other playback targets the user can switch between. */
  hasConnectDevices: boolean;
}

export interface UnifiedUserProfile {
  id: string;
  name: string;
  imageUrl: string | null;
  provider: MusicProviderType;
  subtitle?: string;
}

export interface MusicProvider {
  readonly type: MusicProviderType;

  isAuthenticated(): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  getCurrentTrack(): Promise<UnifiedTrack | null>;
  getPlaybackState(): Promise<PlaybackState | null>;
  getUserProfile(): Promise<UnifiedUserProfile>;

  play(): Promise<void>;
  pause(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volumePercent: number): Promise<void>;

  searchTracks(query: string, limit: number): Promise<UnifiedTrack[]>;
  playTrack(uri: string, startPositionMs?: number): Promise<void>;
  addToQueue(uri: string): Promise<void>;

  getRecentlyPlayed(limit: number): Promise<UnifiedTrack[]>;

  getCapabilities(): ProviderCapabilities;
  getUserPlaylists(limit: number, offset: number): Promise<PlaylistsResult>;
  getPlaylistTracks(
    playlistId: string,
    limit: number,
    offset: number
  ): Promise<PlaylistTracksResult>;
  addToPlaylist(playlistId: string, trackUri: string): Promise<void>;
  playPlaylistFromIndex?(playlistId: string, trackIndex: number, trackUri?: string): Promise<void>;
}

export interface ProviderAuthState {
  isAuthenticated: boolean;
  isConnecting: boolean;
  error: string | null;
}

export function createUri(provider: MusicProviderType, id: string): string {
  switch (provider) {
    case "spotify":
      return `spotify:track:${id}`;
    case "youtube":
      return `youtube:video:${id}`;
  }
}

export function parseUri(uri: string): { provider: MusicProviderType; id: string } | null {
  if (/^youtube:video:[\w-]{11}$/.test(uri)) return { provider: "youtube", id: uri.slice(14) };
  if (uri.startsWith("spotify:track:")) {
    return { provider: "spotify", id: uri.replace("spotify:track:", "") };
  }
  return null;
}

export function getProviderFromUri(uri: string): MusicProviderType | null {
  const parsed = parseUri(uri);
  return parsed?.provider ?? null;
}
