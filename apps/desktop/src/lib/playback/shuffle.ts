import { create } from "zustand";
import { playbackCommand } from "./session";
import { ownsLocalPlayback, usePlaybackSession } from "./sessionStore";
import { getPlayerState, setShuffle } from "../../ui/spotifyClient";
import {
  getSpotifyLocalPlayback,
  isSpotifyWebPlaybackReady,
  subscribeSpotifyLocalPlayback,
} from "../spotifyWebPlayback";

/**
 * Spotify's shuffle. It is a setting of the player, not of a playlist: it
 * carries over to whatever plays next and can be flipped from any other
 * Spotify app, so MiniFy reads it back instead of keeping its own copy.
 */
type ShuffleStore = {
  on: boolean;
  /** A toggle is on its way to Spotify; reports in the meantime are stale. */
  busy: boolean;
};

export const useShuffleStore = create<ShuffleStore>(() => ({ on: false, busy: false }));

export async function refreshShuffle(): Promise<void> {
  if (ownsLocalPlayback()) { useShuffleStore.setState({ on: usePlaybackSession.getState().shuffle }); return; }
  if (useShuffleStore.getState().busy) return;

  const local = getSpotifyLocalPlayback();
  if (isSpotifyWebPlaybackReady() && local) {
    useShuffleStore.setState({ on: local.shuffle });
    return;
  }

  const state = await getPlayerState();
  if (state && !useShuffleStore.getState().busy) {
    useShuffleStore.setState({ on: state.shuffle_state });
  }
}

/** Follows the shuffle state MiniFy's own player reports, whoever changed it. */
export function watchShuffle(): () => void {
  return subscribeSpotifyLocalPlayback((local) => {
    if (local && !ownsLocalPlayback() && !useShuffleStore.getState().busy) {
      useShuffleStore.setState({ on: local.shuffle });
    }
  });
}

export async function toggleShuffle(): Promise<void> {
  const { on, busy } = useShuffleStore.getState();
  if (busy) return;

  useShuffleStore.setState({ on: !on, busy: true });
  try {
    if (ownsLocalPlayback()) await playbackCommand({ action: "shuffle", enabled: !on });
    else await setShuffle(!on);
  } catch (error) {
    useShuffleStore.setState({ on });
    throw error;
  } finally {
    useShuffleStore.setState({ busy: false });
  }
}
