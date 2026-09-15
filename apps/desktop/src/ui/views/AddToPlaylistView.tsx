import { ArrowLeft, MusicNotes, Plus, SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import {
  addTrackToPlaylist,
  fetchAllPlaylists,
  useYouTubeTrackCounts,
} from "../../lib/localLibrary";
import type { UnifiedPlaylist, UnifiedTrack } from "../../providers/types";

type AddToPlaylistViewProps = {
  track: UnifiedTrack | null;
  onBack: () => void;
};

export default function AddToPlaylistView({ track, onBack }: AddToPlaylistViewProps) {
  const { setLayout } = useWindowLayout();
  const [playlists, setPlaylists] = useState<UnifiedPlaylist[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isYouTube = track?.provider === "youtube";
  const youtubeCounts = useYouTubeTrackCounts();

  useEffect(() => {
    setLayout("SearchSongs");
  }, [setLayout]);

  // Spotify only takes tracks into playlists the user may edit. A YouTube
  // track is stored in MiniFy's local copy, so any playlist can take it.
  useEffect(() => {
    let alive = true;
    fetchAllPlaylists()
      .then((all) => {
        if (alive) setPlaylists(all.filter((playlist) => isYouTube || playlist.writable));
      })
      .catch((err) => {
        console.error("Failed to load playlists:", err);
        if (alive) setError(String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isYouTube]);

  const handleAddToPlaylist = async (playlist: UnifiedPlaylist) => {
    if (!track || addingTo) return;

    setAddingTo(playlist.id);
    setError(null);
    try {
      await addTrackToPlaylist(track, playlist.id);
      onBack();
    } catch (err) {
      console.error("Failed to add track to playlist:", err);
      setError(String(err));
      setAddingTo(null);
    }
  };

  return (
    <div className="h-full w-full p-4" style={{ color: "var(--settings-text)" }}>
      <div
        className="flex items-center justify-between mb-3"
        style={{ color: "var(--settings-header-text)" }}
      >
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold">Add to Playlist</h1>
          {track && (
            <p className="text-xs truncate mt-0.5" style={{ color: "var(--settings-text-muted)" }}>
              {isYouTube ? `${track.name} · saved in MiniFy only` : track.name}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="mt-3 rounded-full w-8 h-8 flex items-center justify-center active:scale-[0.95] transition-transform duration-150 hover:bg-[rgba(255,255,255,0.08)]"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
      </div>

      <div className="h-[calc(100%-60px)] w-full flex flex-col gap-3">
        {error && (
          <p className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400" role="alert">
            {error}
          </p>
        )}
        <div
          className="flex-1 rounded-xl border overflow-auto text-sm"
          style={{
            background: "var(--settings-panel-bg)",
            borderColor: "var(--settings-panel-border)",
          }}
        >
          {loading && (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: "var(--settings-text-muted)" }}
            >
              <SpinnerGap size={24} weight="bold" className="animate-spin" />
            </div>
          )}

          {!loading && playlists.length === 0 && (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: "var(--settings-text-muted)" }}
            >
              <p>No playlists found</p>
            </div>
          )}

          {!loading && playlists.length > 0 && (
            <ul className="py-2">
              {playlists.map((playlist) => {
                const playlistImage = playlist.images[0]?.url ?? null;
                const isAdding = addingTo === playlist.id;

                return (
                  <li key={playlist.id}>
                    <button
                      type="button"
                      onClick={() => handleAddToPlaylist(playlist)}
                      disabled={isAdding}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-all duration-150 cursor-pointer hover:bg-[--settings-item-hover] active:scale-[0.99] disabled:opacity-70 disabled:cursor-default"
                    >
                      <div className="relative w-11 h-11 rounded-md overflow-hidden flex-shrink-0 bg-black/30">
                        {playlistImage ? (
                          <img
                            src={playlistImage}
                            alt={playlist.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            style={{ background: "var(--settings-item-active)" }}
                          >
                            <MusicNotes size={16} weight="fill" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className="font-medium truncate text-sm"
                          style={{ color: "var(--settings-text)" }}
                        >
                          {playlist.name}
                        </p>
                        <p
                          className="text-xs truncate"
                          style={{ color: "var(--settings-text-muted)" }}
                        >
                          {playlist.trackCount + (youtubeCounts[playlist.id] ?? 0)} tracks
                        </p>
                      </div>

                      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                        {isAdding ? (
                          <SpinnerGap
                            size={18}
                            weight="bold"
                            className="animate-spin"
                            style={{ color: "var(--settings-accent)" }}
                          />
                        ) : (
                          <Plus size={18} weight="bold" className="opacity-50" />
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
