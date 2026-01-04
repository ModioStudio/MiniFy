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

export interface MusicProvider {
  readonly type: MusicProviderType;

  isAuthenticated(): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  getCurrentTrack(): Promise<UnifiedTrack | null>;
  getPlaybackState(): Promise<PlaybackState | null>;

  play(): void;
  pause(): void;
  nextTrack(): void;
  previousTrack(): void;
  seek(positionMs: number): void;
  setVolume(volumePercent: number): void;

  searchTracks(query: string, limit: number): Promise<UnifiedTrack[]>;
  playTrack(uri: string): Promise<void>;
  addToQueue(uri: string): Promise<void>;

  getRecentlyPlayed(limit: number): Promise<UnifiedTrack[]>;
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
  if (uri.startsWith("spotify:track:")) {
    return { provider: "spotify", id: uri.replace("spotify:track:", "") };
  }
  if (uri.startsWith("youtube:video:")) {
    return { provider: "youtube", id: uri.replace("youtube:video:", "") };
  }
  return null;
}

export function getProviderFromUri(uri: string): MusicProviderType | null {
  const parsed = parseUri(uri);
  return parsed?.provider ?? null;
}
