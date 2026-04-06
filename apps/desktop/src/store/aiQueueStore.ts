import { create } from "zustand";

export interface QueuedTrack {
  name: string;
  artists: string;
  uri: string;
}

const PLAYED_URIS_STORAGE_KEY = "minify_ai_played_uris";
const MAX_PLAYED_URIS = 500;

function loadPlayedUris(): Set<string> {
  try {
    const stored = localStorage.getItem(PLAYED_URIS_STORAGE_KEY);
    if (stored) {
      const arr = JSON.parse(stored) as string[];
      return new Set(arr.slice(-MAX_PLAYED_URIS));
    }
  } catch {
    // Ignore parse errors
  }
  return new Set<string>();
}

function savePlayedUris(uris: Set<string>): void {
  try {
    const arr = Array.from(uris).slice(-MAX_PLAYED_URIS);
    localStorage.setItem(PLAYED_URIS_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage errors
  }
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
  clearPlayedHistory: () => void;
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
  playedUris: loadPlayedUris(),

  setActive: (active) => set({ isActive: active }),
  setLoading: (loading) => set({ isLoading: loading }),
  setQueue: (queue) => {
    const playedUris = new Set(get().playedUris);
    for (const track of queue) {
      playedUris.add(track.uri);
    }
    savePlayedUris(playedUris);
    set({ queue, currentIndex: 0, playedUris });
  },
  addToQueue: (tracks) =>
    set((state) => {
      const playedUris = new Set(state.playedUris);
      for (const track of tracks) {
        playedUris.add(track.uri);
      }
      savePlayedUris(playedUris);
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
  setCachedUserProfile: (profile) => set({ cachedUserProfile: profile, lastFetchTime: Date.now() }),
  addPlayedUri: (uri) =>
    set((state) => {
      const playedUris = new Set(state.playedUris);
      playedUris.add(uri);
      savePlayedUris(playedUris);
      return { playedUris };
    }),
  hasPlayed: (uri) => get().playedUris.has(uri),
  clearPlayedHistory: () => {
    localStorage.removeItem(PLAYED_URIS_STORAGE_KEY);
    set({ playedUris: new Set<string>() });
  },
  reset: () =>
    set({
      isActive: false,
      isLoading: false,
      queue: [],
      currentIndex: 0,
      error: null,
      // Keep playedUris - don't reset history on queue stop
    }),
}));
