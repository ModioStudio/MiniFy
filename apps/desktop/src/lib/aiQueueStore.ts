import { create } from "zustand";

export interface QueuedTrack {
  name: string;
  artists: string;
  uri: string;
}

interface AIQueueState {
  isActive: boolean;
  isLoading: boolean;
  queue: QueuedTrack[];
  currentIndex: number;
  error: string | null;
  cachedUserProfile: string | null;
  lastFetchTime: number;
  playedUris: Set<string>;

  setActive: (active: boolean) => void;
  setLoading: (loading: boolean) => void;
  setQueue: (queue: QueuedTrack[]) => void;
  addToQueue: (tracks: QueuedTrack[]) => void;
  setCurrentIndex: (index: number) => void;
  advanceQueue: () => void;
  setError: (error: string | null) => void;
  setCachedUserProfile: (profile: string | null) => void;
  addPlayedUri: (uri: string) => void;
  hasPlayed: (uri: string) => boolean;
  reset: () => void;
}

export const useAIQueueStore = create<AIQueueState>((set, get) => ({
  isActive: false,
  isLoading: false,
  queue: [],
  currentIndex: 0,
  error: null,
  cachedUserProfile: null,
  lastFetchTime: 0,
  playedUris: new Set<string>(),

  setActive: (active) => set({ isActive: active }),
  setLoading: (loading) => set({ isLoading: loading }),
  setQueue: (queue) => {
    const playedUris = get().playedUris;
    for (const track of queue) {
      playedUris.add(track.uri);
    }
    set({ queue, currentIndex: 0, playedUris: new Set(playedUris) });
  },
  addToQueue: (tracks) =>
    set((state) => {
      const playedUris = new Set(state.playedUris);
      for (const track of tracks) {
        playedUris.add(track.uri);
      }
      return {
        queue: [...state.queue, ...tracks],
        playedUris,
      };
    }),
  setCurrentIndex: (index) => set({ currentIndex: index }),
  advanceQueue: () =>
    set((state) => ({
      currentIndex: state.currentIndex + 1,
    })),
  setError: (error) => set({ error }),
  setCachedUserProfile: (profile) =>
    set({ cachedUserProfile: profile, lastFetchTime: Date.now() }),
  addPlayedUri: (uri) =>
    set((state) => {
      const playedUris = new Set(state.playedUris);
      playedUris.add(uri);
      return { playedUris };
    }),
  hasPlayed: (uri) => get().playedUris.has(uri),
  reset: () =>
    set({
      isActive: false,
      isLoading: false,
      queue: [],
      currentIndex: 0,
      error: null,
      playedUris: new Set<string>(),
    }),
}));

