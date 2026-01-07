import { ArrowLeft, MusicNotes, Plus, SpinnerGap, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import { getActiveProviderType } from "../../providers";
import type { MusicProviderType } from "../../providers/types";
import { addTrackToPlaylist, fetchUserPlaylists, type SimplifiedPlaylist } from "../spotifyClient";

type AddToPlaylistViewProps = {
  trackId: string | null;
  trackName: string | null;
  onBack: () => void;
};

export default function AddToPlaylistView({ trackId, trackName, onBack }: AddToPlaylistViewProps) {
  const { setLayout } = useWindowLayout();
  const [providerType, setProviderType] = useState<MusicProviderType | null>(null);
  const [playlists, setPlaylists] = useState<SimplifiedPlaylist[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  useEffect(() => {
    setLayout("SearchSongs");
  }, [setLayout]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const type = await getActiveProviderType();
      setProviderType(type);

      if (type !== "spotify") {
        setLoading(false);
        return;
      }

      try {
        const response = await fetchUserPlaylists(50, 0);
        setPlaylists(response.playlists);
      } catch (err) {
        console.error("Failed to load playlists:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleAddToPlaylist = async (playlist: SimplifiedPlaylist) => {
    if (!trackId || addingTo) return;

    setAddingTo(playlist.id);
    try {
      await addTrackToPlaylist(playlist.id, `spotify:track:${trackId}`);
      onBack();
    } catch (err) {
      console.error("Failed to add track to playlist:", err);
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
          {trackName && (
            <p className="text-xs truncate mt-0.5" style={{ color: "var(--settings-text-muted)" }}>
              {trackName}
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

          {!loading && providerType === "youtube" && (
            <div
              className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center"
              style={{ color: "var(--settings-text-muted)" }}
            >
              <Warning size={32} weight="fill" className="text-yellow-500" />
              <p className="font-medium">Not available</p>
              <p className="text-xs">
                YouTube Music does not support adding tracks to playlists through the API.
              </p>
            </div>
          )}

          {!loading && providerType === "spotify" && playlists.length === 0 && (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: "var(--settings-text-muted)" }}
            >
              <p>No playlists found</p>
            </div>
          )}

          {!loading && providerType === "spotify" && playlists.length > 0 && (
            <ul className="py-2">
              {playlists.map((playlist) => {
                const playlistImage =
                  playlist.images && playlist.images.length > 0 ? playlist.images[0]?.url : null;
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
                          {playlist.tracks.total} tracks
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
