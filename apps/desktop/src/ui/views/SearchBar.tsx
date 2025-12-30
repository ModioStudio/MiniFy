import { ArrowLeft, ClockCounterClockwise, MagnifyingGlass, Play, SpinnerGap } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import {
  fetchRecentlyPlayed,
  getLargestImageUrl,
  playTrack,
  searchTracks,
  SimplifiedTrack,
} from "../spotifyClient";

type SearchBarProps = {
  onBack: () => void;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function SearchBar({ onBack }: SearchBarProps) {
  const { setLayout } = useWindowLayout();
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<SimplifiedTrack[]>([]);
  const [recentTracks, setRecentTracks] = useState<SimplifiedTrack[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingRecent, setLoadingRecent] = useState<boolean>(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLayout("SearchSongs");
  }, [setLayout]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const loadRecentTracks = async () => {
      setLoadingRecent(true);
      try {
        const tracks = await fetchRecentlyPlayed(20);
        setRecentTracks(tracks);
      } catch (err) {
        console.error("Failed to load recent tracks:", err);
      } finally {
        setLoadingRecent(false);
      }
    };
    loadRecentTracks();
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const tracks = await searchTracks(searchQuery, 20);
      setResults(tracks);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

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

  const isSearching = query.trim() !== "";
  const displayTracks = isSearching ? results : recentTracks;
  const isLoading = isSearching ? loading : loadingRecent;

  return (
    <div className="h-full w-full p-4" style={{ color: "var(--settings-text)" }}>
      <div className="flex items-center justify-between mb-3" style={{ color: "var(--settings-header-text)" }}>
        <h1 className="text-base font-semibold">Search</h1>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="mt-3 rounded-full w-8 h-8 flex items-center justify-center active:scale-[0.95] transition-transform duration-150 hover:bg-[rgba(255,255,255,0.08)]"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
      </div>

      <div className="h-[calc(100%-40px)] w-full flex flex-col gap-3">
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            background: "var(--settings-panel-bg)",
            borderColor: "var(--settings-panel-border)",
          }}
        >
          <div className="relative w-full">
            <MagnifyingGlass
              size={18}
              weight="bold"
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--settings-text-muted)" }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="What do you want to listen to?"
              className="w-full bg-transparent px-4 pl-10 py-3 text-sm outline-none"
              style={{
                color: "var(--settings-text)",
              }}
            />
            {loading && (
              <SpinnerGap
                size={18}
                weight="bold"
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin"
                style={{ color: "var(--settings-accent)" }}
              />
            )}
          </div>
        </div>

        <div
          className="flex-1 rounded-xl border overflow-auto text-sm"
          style={{
            background: "var(--settings-panel-bg)",
            borderColor: "var(--settings-panel-border)",
          }}
        >
          {!isSearching && !loadingRecent && recentTracks.length > 0 && (
            <div
              className="flex items-center gap-2 px-3 py-2 border-b"
              style={{ 
                borderColor: "var(--settings-panel-border)",
                color: "var(--settings-text-muted)" 
              }}
            >
              <ClockCounterClockwise size={14} weight="bold" />
              <span className="text-xs font-medium">Recently played</span>
            </div>
          )}

          {isLoading && (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: "var(--settings-text-muted)" }}
            >
              <SpinnerGap size={24} weight="bold" className="animate-spin" />
            </div>
          )}

          {!isLoading && displayTracks.length === 0 && isSearching && (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: "var(--settings-text-muted)" }}
            >
              <p>No results found</p>
            </div>
          )}

          {!isLoading && displayTracks.length === 0 && !isSearching && (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: "var(--settings-text-muted)" }}
            >
              <p>No recent tracks</p>
            </div>
          )}

          {!isLoading && displayTracks.length > 0 && (
            <ul className="py-2">
              {displayTracks.map((track) => {
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
          )}
        </div>
      </div>
    </div>
  );
}
