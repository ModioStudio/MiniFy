import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { createSpotifyProvider } from "../providers/spotify";
import type { UnifiedPlaylist, UnifiedTrack } from "../providers/types";
import { fetchPlaylistSnapshot } from "../ui/spotifyClient";
import { loadAllPlaylistTracks } from "./playlistTracks";

export type PlaylistEntry = { entryId: string; track: UnifiedTrack; remoteKey: string | null };
export type LocalPlaylist = {
  version: number;
  revision: number;
  accountId: string;
  playlistId: string;
  customized: boolean;
  /** Spotify's version of the playlist when this copy was last synced. */
  snapshotId: string | null;
  entries: PlaylistEntry[];
};
/** What `local-playlist-changed` carries: enough to tell whether to read again. */
export type PlaylistChange = {
  accountId: string;
  playlistId: string;
  revision: number;
  localCount: number;
};
export type PlaylistEdit =
  | { op: "add"; track: UnifiedTrack }
  | { op: "move"; entryId: string; beforeId: string | null }
  | { op: "remove"; entryId: string };

/** The account the local copies belong to, asked of Spotify every few minutes, not per call. */
const ACCOUNT_TTL_MS = 5 * 60_000;
let account: { id: Promise<string>; at: number } | null = null;

function accountId(): Promise<string> {
  let current = account;
  if (!current || Date.now() - current.at > ACCOUNT_TTL_MS) {
    const id = createSpotifyProvider()
      .getUserProfile()
      .then((profile) => profile.id);
    const entry = { id, at: Date.now() };
    current = entry;
    account = entry;
    id.catch(() => {
      if (account === entry) account = null;
    });
  }
  return current.id;
}

export async function readLocalPlaylist(playlistId: string): Promise<LocalPlaylist> {
  return invoke("read_local_playlist", { accountId: await accountId(), playlistId });
}

/** Local files and songs Spotify pulled have no id; they cannot play in MiniFy. */
function playable(track: UnifiedTrack): boolean {
  return Boolean(track.id) && track.uri.startsWith("spotify:track:");
}

/**
 * What a playlist entry keeps of a track. One cover instead of Spotify's three
 * sizes: a row shows it at 44px, and three URLs per song made big playlists
 * heavy to store and to pass between the app's layers.
 */
function slim(track: UnifiedTrack): UnifiedTrack {
  const images = track.album.images;
  const cover = images.find((image) => image.width >= 160 && image.width <= 320) ?? images[0];
  return { ...track, album: { ...track.album, images: cover ? [cover] : [] } };
}

type RefreshOptions = {
  /** The local copy already at hand, saving a read. */
  known?: LocalPlaylist;
  cancelled?: () => boolean;
  /** Receives the songs page by page, in playlist order, while they load. */
  onPage?: (tracks: UnifiedTrack[]) => void;
};

/**
 * Brings the local copy in line with Spotify. Spotify's snapshot id changes
 * with every edit to a playlist, so while it matches the copy, the songs are
 * not fetched at all: opening a big playlist is one small request.
 */
export async function refreshLocalPlaylist(
  playlistId: string,
  { known, cancelled = () => false, onPage }: RefreshOptions = {}
): Promise<LocalPlaylist> {
  const owner = await accountId();
  const local = known ?? (await readLocalPlaylist(playlistId));
  const snapshot = await fetchPlaylistSnapshot(playlistId).catch(() => null);
  if (snapshot && local.snapshotId === snapshot && local.accountId === owner) return local;
  const tracks = await loadAllPlaylistTracks(
    createSpotifyProvider(),
    playlistId,
    (page) => onPage?.(page.tracks.filter(playable)),
    cancelled
  );
  if (cancelled()) throw new Error("Playlist loading cancelled");
  return invoke("reconcile_local_playlist", {
    accountId: owner,
    playlistId,
    snapshotId: snapshot,
    tracks: tracks.filter(playable).map(slim),
  });
}

export function editLocalPlaylist(
  playlist: LocalPlaylist,
  action: PlaylistEdit
): Promise<LocalPlaylist> {
  return invoke("edit_local_playlist", {
    accountId: playlist.accountId,
    playlistId: playlist.playlistId,
    revision: playlist.revision,
    action,
  });
}

/**
 * YouTube songs per playlist, which Spotify's own track counts leave out. Kept
 * current as playlists change in any window.
 */
export function useYouTubeTrackCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    const off = listen<PlaylistChange>("local-playlist-changed", ({ payload }) => {
      setCounts((current) =>
        current[payload.playlistId] === payload.localCount
          ? current
          : { ...current, [payload.playlistId]: payload.localCount }
      );
    });
    accountId()
      .then((id) => invoke<Record<string, number>>("local_playlist_counts", { accountId: id }))
      .then((stored) => {
        if (alive) setCounts((current) => ({ ...stored, ...current }));
      })
      .catch(() => {});
    return () => {
      alive = false;
      void off.then((dispose) => dispose());
    };
  }, []);
  return counts;
}

export async function fetchAllPlaylists(): Promise<UnifiedPlaylist[]> {
  const provider = createSpotifyProvider();
  const all: UnifiedPlaylist[] = [];
  for (;;) {
    const page = await provider.getUserPlaylists(50, all.length);
    all.push(...page.playlists);
    if (!page.playlists.length || all.length >= page.total) return all;
  }
}

/** Spotify tracks are written to Spotify; YouTube tracks only to MiniFy's local copy. */
export async function addTrackToPlaylist(track: UnifiedTrack, playlistId: string): Promise<void> {
  if (track.provider === "spotify") {
    await createSpotifyProvider().addToPlaylist(playlistId, track.uri);
    // Spotify accepted the write; never offer a retry that would add a duplicate.
    // The sync runs in the background, and an open playlist picks it up.
    void refreshLocalPlaylist(playlistId).catch(() => {});
    return;
  }
  // A copy never synced would put the song above all of Spotify's.
  const stored = await refreshLocalPlaylist(playlistId).catch(() => readLocalPlaylist(playlistId));
  await editLocalPlaylist(stored, { op: "add", track });
}
