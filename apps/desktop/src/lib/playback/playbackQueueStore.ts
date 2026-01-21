import { create } from "zustand";
import type { MusicProviderType, UnifiedTrack } from "../../providers/types";

export interface PlaybackQueueState {
  tracks: UnifiedTrack[];
  currentIndex: number;
  playlistId: string | null;
  provider: MusicProviderType | null;
  isPlaylistMode: boolean;

  setPlaylistQueue: (
    playlistId: string,
    tracks: UnifiedTrack[],
    startIndex: number,
    provider: MusicProviderType
  ) => void;
  setSingleTrack: (track: UnifiedTrack, provider: MusicProviderType) => void;
  advanceToNext: () => UnifiedTrack | null;
  getCurrentTrack: () => UnifiedTrack | null;
  getNextTrack: () => UnifiedTrack | null;
  getRemainingCount: () => number;
  appendTracks: (tracks: UnifiedTrack[]) => void;
  clear: () => void;
}

export const usePlaybackQueueStore = create<PlaybackQueueState>((set, get) => ({
  tracks: [],
  currentIndex: -1,
  playlistId: null,
  provider: null,
  isPlaylistMode: false,

  setPlaylistQueue: (playlistId, tracks, startIndex, provider) =>
    set({
      playlistId,
      tracks,
      currentIndex: startIndex,
      provider,
      isPlaylistMode: true,
    }),

  setSingleTrack: (track, provider) =>
    set({
      playlistId: null,
      tracks: [track],
      currentIndex: 0,
      provider,
      isPlaylistMode: false,
    }),

  advanceToNext: () => {
    const state = get();
    const nextIndex = state.currentIndex + 1;
    if (nextIndex < state.tracks.length) {
      set({ currentIndex: nextIndex });
      return state.tracks[nextIndex] ?? null;
    }
    return null;
  },

  getCurrentTrack: () => {
    const state = get();
    return state.tracks[state.currentIndex] ?? null;
  },

  getNextTrack: () => {
    const state = get();
    return state.tracks[state.currentIndex + 1] ?? null;
  },

  getRemainingCount: () => {
    const state = get();
    return Math.max(0, state.tracks.length - state.currentIndex - 1);
  },

  appendTracks: (tracks) =>
    set((state) => ({
      tracks: [...state.tracks, ...tracks],
    })),

  clear: () =>
    set({
      tracks: [],
      currentIndex: -1,
      playlistId: null,
      provider: null,
      isPlaylistMode: false,
    }),
}));
