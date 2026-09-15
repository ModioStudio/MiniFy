import { Play, SpinnerGap } from "@phosphor-icons/react";
import { listen } from "@tauri-apps/api/event";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  editLocalPlaylist,
  type LocalPlaylist,
  type PlaylistChange,
  type PlaylistEdit,
  readLocalPlaylist,
  refreshLocalPlaylist,
} from "../../lib/localLibrary";
import { playbackCommand } from "../../lib/playback/session";
import { usePlaybackSession } from "../../lib/playback/sessionStore";
import { useShuffleStore } from "../../lib/playback/shuffle";
import { prefetchYouTubeAudio } from "../../lib/youtube";
import type { UnifiedPlaylist, UnifiedTrack } from "../../providers/types";
import LibraryTrackList from "./LibraryTrackList";

/** The edit as Rust applies it, shown at once instead of after the round trip. */
function applyEdit(playlist: LocalPlaylist, action: PlaylistEdit): LocalPlaylist {
  if (action.op === "remove") {
    return {
      ...playlist,
      customized: true,
      entries: playlist.entries.filter((entry) => entry.entryId !== action.entryId),
    };
  }
  if (action.op !== "move" || action.beforeId === action.entryId) return playlist;
  const entries = [...playlist.entries];
  const from = entries.findIndex((entry) => entry.entryId === action.entryId);
  if (from < 0) return playlist;
  const [moved] = entries.splice(from, 1);
  const before =
    action.beforeId === null ? -1 : entries.findIndex((entry) => entry.entryId === action.beforeId);
  entries.splice(before < 0 ? entries.length : before, 0, moved);
  return { ...playlist, customized: true, entries };
}

/** Only YouTube entries live in MiniFy alone; Spotify's are removed in Spotify. */
const removable = (track: UnifiedTrack) => track.provider === "youtube";

/** How many of a playlist's YouTube songs start loading when it opens. */
const PREFETCH_ON_OPEN = 3;

// Memoised: the shell re-renders with every playback report.
export default memo(LocalPlaylistTracks);

function LocalPlaylistTracks({ playlist }: { playlist: UnifiedPlaylist }) {
  const [saved, setSaved] = useState<LocalPlaylist | null>(null);
  /** Songs shown while a playlist opened for the first time is still loading. */
  const [preview, setPreview] = useState<UnifiedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The last state Rust confirmed. Edits build on it, strictly one after another. */
  const confirmed = useRef<LocalPlaylist | null>(null);
  const pending = useRef(0);
  const edits = useRef<Promise<void>>(Promise.resolve());
  const currentEntryId = usePlaybackSession((session) =>
    session.playlistId === playlist.id ? session.entryId : null
  );
  const prefetched = useRef(false);

  useEffect(() => {
    let alive = true;
    confirmed.current = null;
    pending.current = 0;
    setSaved(null);
    setPreview([]);
    setLoading(true);
    setError(null);
    const accept = (next: LocalPlaylist) => {
      if (!alive || next.playlistId !== playlist.id) return;
      const known = confirmed.current;
      if (known && (known.accountId !== next.accountId || known.revision > next.revision)) return;
      confirmed.current = next;
      // While edits are on their way the optimistic order stays on screen.
      if (pending.current === 0) setSaved(next);
    };
    // The event only says the playlist changed; a newer copy is read back.
    const off = listen<PlaylistChange>("local-playlist-changed", ({ payload }) => {
      const known = confirmed.current;
      if (!alive || payload.playlistId !== playlist.id || pending.current > 0) return;
      if (known && (known.accountId !== payload.accountId || known.revision >= payload.revision))
        return;
      void readLocalPlaylist(playlist.id)
        .then(accept)
        .catch(() => {});
    });
    void readLocalPlaylist(playlist.id)
      .then((local) => {
        accept(local);
        // Nothing stored yet: show the songs page by page as they arrive.
        const onPage =
          local.entries.length === 0
            ? (tracks: UnifiedTrack[]) => {
                if (alive) setPreview((current) => [...current, ...tracks]);
              }
            : undefined;
        return refreshLocalPlaylist(playlist.id, {
          known: local,
          cancelled: () => !alive,
          onPage,
        });
      })
      .then(accept)
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setPreview([]);
      });
    return () => {
      alive = false;
      void off.then((dispose) => dispose());
    };
  }, [playlist.id]);

  useEffect(() => {
    if (!saved || prefetched.current) return;
    const ids = saved.entries
      .filter((entry) => entry.track.provider === "youtube")
      .slice(0, PREFETCH_ON_OPEN)
      .map((entry) => entry.track.id);
    if (ids.length === 0) return;
    prefetched.current = true;
    prefetchYouTubeAudio(ids);
  }, [saved]);

  function edit(action: PlaylistEdit) {
    if (!confirmed.current) return;
    setSaved((current) => (current ? applyEdit(current, action) : current));
    setError(null);
    pending.current++;
    edits.current = edits.current.then(async () => {
      try {
        const base = confirmed.current;
        if (base) confirmed.current = await editLocalPlaylist(base, action);
      } catch (e) {
        setError(String(e));
        confirmed.current = await readLocalPlaylist(playlist.id).catch(() => confirmed.current);
      } finally {
        pending.current--;
        if (pending.current === 0 && confirmed.current) setSaved(confirmed.current);
      }
    });
  }

  function reorder(from: number, to: number) {
    const entries = saved?.entries;
    const entry = entries?.[from];
    if (!entries || !entry || from === to) return;
    const beforeId =
      to > from ? (entries[to + 1]?.entryId ?? null) : (entries[to]?.entryId ?? null);
    edit({ op: "move", entryId: entry.entryId, beforeId });
  }

  function remove(index: number) {
    const entry = saved?.entries[index];
    if (entry) edit({ op: "remove", entryId: entry.entryId });
  }

  function play(index: number) {
    const entry = saved?.entries[index];
    if (!saved || !entry) return;
    void playbackCommand({
      action: "playlist",
      playlist: saved,
      entryId: entry.entryId,
      shuffle: useShuffleStore.getState().on,
    }).catch((e) => setError(String(e)));
  }

  // The big play button: from the top, or from a random song with shuffle on.
  function playAll() {
    const count = saved?.entries.length ?? 0;
    if (count === 0) return;
    play(useShuffleStore.getState().on ? Math.floor(Math.random() * count) : 0);
  }

  const stored = saved?.entries.length ?? 0;
  const showingPreview = stored === 0 && preview.length > 0;
  const tracks = useMemo(
    () => (showingPreview ? preview : (saved?.entries.map((entry) => entry.track) ?? [])),
    [showingPreview, preview, saved]
  );
  const keys = useMemo(
    () =>
      showingPreview
        ? preview.map((track, index) => track.playlistKey ?? `${track.uri}#${index}`)
        : (saved?.entries.map((entry) => entry.entryId) ?? []),
    [showingPreview, preview, saved]
  );

  return (
    <section className="library-playlist">
      <div className="library-playlist-toolbar">
        <button
          type="button"
          onClick={playAll}
          disabled={stored === 0}
          title="Play playlist"
          aria-label="Play playlist"
        >
          <Play size={20} weight="fill" />
        </button>
        <span>{stored || playlist.trackCount} tracks</span>
        {saved?.customized && <small>Local order</small>}
        {loading && <SpinnerGap size={18} className="animate-spin" />}
      </div>
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}
      <LibraryTrackList
        tracks={tracks}
        keys={keys}
        currentKey={currentEntryId}
        disabled={showingPreview || stored === 0}
        onPlay={(_track, index) => play(index)}
        onReorder={reorder}
        canRemove={removable}
        onRemove={remove}
      />
      {!loading && tracks.length === 0 && (
        <p className="library-empty">No tracks in this playlist</p>
      )}
    </section>
  );
}
