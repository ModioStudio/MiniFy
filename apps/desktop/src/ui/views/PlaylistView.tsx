import { ArrowLeft, MusicNotes, Play, SpinnerGap } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import {
  type SimplifiedPlaylist,
  type SimplifiedTrack,
  fetchPlaylistTracks,
  fetchUserPlaylists,
  getLargestImageUrl,
  playTrack,
} from "../spotifyClient";

type PlaylistViewProps = {
  onBack: () => void;
};

type ViewMode = "playlists" | "tracks";

const TRACKS_PER_PAGE = 30;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function PlaylistView({ onBack }: PlaylistViewProps) {
  const { setLayout } = useWindowLayout();
  const [playlists, setPlaylists] = useState<SimplifiedPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SimplifiedPlaylist | null>(null);
  const [tracks, setTracks] = useState<SimplifiedTrack[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState<boolean>(true);
  const [loadingTracks, setLoadingTracks] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("playlists");
  const [totalTracks, setTotalTracks] = useState<number>(0);
  const [hasMoreTracks, setHasMoreTracks] = useState<boolean>(false);
  const tracksContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLayout("SearchSongs");
  }, [setLayout]);

  useEffect(() => {
    const loadPlaylists = async () => {
      setLoadingPlaylists(true);
      try {
        const response = await fetchUserPlaylists(50, 0);
        setPlaylists(response.playlists);
      } catch (err) {
        console.error("Failed to load playlists:", err);
      } finally {
        setLoadingPlaylists(false);
      }
    };
    loadPlaylists();
  }, []);

  const handleSelectPlaylist = useCallback(async (playlist: SimplifiedPlaylist) => {
    setSelectedPlaylist(playlist);
    setViewMode("tracks");
    setLoadingTracks(true);
    setTracks([]);
    try {
      const response = await fetchPlaylistTracks(playlist.id, TRACKS_PER_PAGE, 0);
      setTracks(response.tracks);
      setTotalTracks(response.total);
      setHasMoreTracks(response.tracks.length < response.total);
    } catch (err) {
      console.error("Failed to load playlist tracks:", err);
      setTracks([]);
    } finally {
      setLoadingTracks(false);
    }
  }, []);

  const loadMoreTracks = useCallback(async () => {
    if (!selectedPlaylist || loadingMore || !hasMoreTracks) return;

    setLoadingMore(true);
    try {
      const response = await fetchPlaylistTracks(
        selectedPlaylist.id,
        TRACKS_PER_PAGE,
        tracks.length
      );
      setTracks((prev) => [...prev, ...response.tracks]);
      setHasMoreTracks(tracks.length + response.tracks.length < response.total);
    } catch (err) {
      console.error("Failed to load more tracks:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [selectedPlaylist, loadingMore, hasMoreTracks, tracks.length]);

  const handleScroll = useCallback(() => {
    const container = tracksContainerRef.current;
    if (!container || loadingMore || !hasMoreTracks) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      loadMoreTracks();
    }
  }, [loadMoreTracks, loadingMore, hasMoreTracks]);

  const handleBackToPlaylists = useCallback(() => {
    setViewMode("playlists");
    setSelectedPlaylist(null);
    setTracks([]);
    setTotalTracks(0);
    setHasMoreTracks(false);
  }, []);

  const handlePlayTrack = async (track: SimplifiedTrack) => {
    setPlayingId(track.id);
    try {
      await playTrack(`spotify:track:${track.id}`);
    } catch (err) {
      console.error("Play failed:", err);
    } finally {
      setPlayingId(null);
    }
  };

  const handleBack = () => {
    if (viewMode === "tracks") {
      handleBackToPlaylists();
    } else {
      onBack();
    }
  };

  return (
    <div className="h-full w-full p-4" style={{ color: "var(--settings-text)" }}>
      <div
        className="flex items-center justify-between mb-3"
        style={{ color: "var(--settings-header-text)" }}
      >
        <h1 className="text-base font-semibold">
          {viewMode === "playlists" ? "Playlists" : selectedPlaylist?.name ?? "Playlist"}
        </h1>
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="mt-3 rounded-full w-8 h-8 flex items-center justify-center active:scale-[0.95] transition-transform duration-150 hover:bg-[rgba(255,255,255,0.08)]"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
      </div>

      <div className="h-[calc(100%-40px)] w-full flex flex-col gap-3">
        <div
          className="flex-1 rounded-xl border overflow-auto text-sm"
          style={{
            background: "var(--settings-panel-bg)",
            borderColor: "var(--settings-panel-border)",
          }}
        >
          {viewMode === "playlists" && (
            <>
              {loadingPlaylists && (
                <div
                  className="flex items-center justify-center h-full"
                  style={{ color: "var(--settings-text-muted)" }}
                >
                  <SpinnerGap size={24} weight="bold" className="animate-spin" />
                </div>
              )}

              {!loadingPlaylists && playlists.length === 0 && (
                <div
                  className="flex items-center justify-center h-full"
                  style={{ color: "var(--settings-text-muted)" }}
                >
                  <p>No playlists found</p>
                </div>
              )}

              {!loadingPlaylists && playlists.length > 0 && (
                <ul className="py-2">
                  {playlists.map((playlist) => {
                    const playlistImage =
                      playlist.images && playlist.images.length > 0 ? playlist.images[0]?.url : null;

                    return (
                      <li key={playlist.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectPlaylist(playlist)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left transition-all duration-150 cursor-pointer hover:bg-[--settings-item-hover] active:scale-[0.99] group"
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
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {viewMode === "tracks" && (
            <>
              {loadingTracks && (
                <div
                  className="flex items-center justify-center h-full"
                  style={{ color: "var(--settings-text-muted)" }}
                >
                  <SpinnerGap size={24} weight="bold" className="animate-spin" />
                </div>
              )}

              {!loadingTracks && tracks.length === 0 && (
                <div
                  className="flex items-center justify-center h-full"
                  style={{ color: "var(--settings-text-muted)" }}
                >
                  <p>No tracks in this playlist</p>
                </div>
              )}

              {!loadingTracks && tracks.length > 0 && (
                <div
                  ref={tracksContainerRef}
                  onScroll={handleScroll}
                  className="h-full overflow-auto"
                >
                  <ul className="py-2">
                    {tracks.map((track) => {
                      const albumArt = getLargestImageUrl(track.album.images);
                      const artistNames = track.artists.map((a) => a.name).join(", ");
                      const isPlaying = playingId === track.id;

                      return (
                        <li key={track.id}>
                          <button
                            type="button"
                            onClick={() => handlePlayTrack(track)}
                            disabled={isPlaying}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left transition-all duration-150 cursor-pointer hover:bg-[--settings-item-hover] active:scale-[0.99] group"
                          >
                            <div className="relative w-11 h-11 rounded-md overflow-hidden flex-shrink-0 bg-black/30">
                              {albumArt ? (
                                <img
                                  src={albumArt}
                                  alt={track.album.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  style={{ background: "var(--settings-item-active)" }}
                                >
                                  <Play size={16} weight="fill" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                {isPlaying ? (
                                  <SpinnerGap
                                    size={20}
                                    weight="bold"
                                    className="animate-spin"
                                    style={{ color: "var(--settings-accent)" }}
                                  />
                                ) : (
                                  <Play
                                    size={20}
                                    weight="fill"
                                    style={{ color: "var(--settings-text)" }}
                                  />
                                )}
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <p
                                className="font-medium truncate text-sm"
                                style={{ color: "var(--settings-text)" }}
                              >
                                {track.name}
                              </p>
                              <p
                                className="text-xs truncate"
                                style={{ color: "var(--settings-text-muted)" }}
                              >
                                {artistNames}
                              </p>
                            </div>

                            <span
                              className="text-xs flex-shrink-0"
                              style={{ color: "var(--settings-text-muted)" }}
                            >
                              {formatDuration(track.duration_ms)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {loadingMore && (
                    <div
                      className="flex items-center justify-center py-3"
                      style={{ color: "var(--settings-text-muted)" }}
                    >
                      <SpinnerGap size={18} weight="bold" className="animate-spin" />
                    </div>
                  )}

                  {hasMoreTracks && !loadingMore && (
                    <div
                      className="text-center py-2 text-xs"
                      style={{ color: "var(--settings-text-muted)" }}
                    >
                      {tracks.length} / {totalTracks} tracks loaded
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

