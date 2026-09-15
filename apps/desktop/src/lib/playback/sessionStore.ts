import { create } from "zustand";
import type { PlaybackState } from "../../providers/types";
import type { LocalPlaylist } from "../localLibrary";

export type PlaybackSession = {
  local: boolean;
  playback: PlaybackState | null;
  /** Only in the main window; the other windows get `playlistId`. */
  playlist: LocalPlaylist | null;
  playlistId: string | null;
  entryId: string | null;
  loading: boolean;
  error: string | null;
  shuffle: boolean;
};
export const usePlaybackSession = create<PlaybackSession>(() => ({
  local: false,
  playback: null,
  playlist: null,
  playlistId: null,
  entryId: null,
  loading: false,
  error: null,
  shuffle: false,
}));
export function ownsLocalPlayback() {
  return usePlaybackSession.getState().local;
}
