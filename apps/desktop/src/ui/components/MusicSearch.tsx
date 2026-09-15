import {
  ClockCounterClockwise,
  MagnifyingGlass,
  SpinnerGap,
  SpotifyLogo,
  X,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { memo, useEffect, useRef, useState } from "react";
import { playbackCommand } from "../../lib/playback/session";
import { prefetchYouTubeAudio, searchYouTube, useYouTubeConnection } from "../../lib/youtube";
import { createSpotifyProvider } from "../../providers/spotify";
import type { MusicProviderType, UnifiedTrack } from "../../providers/types";
import LibraryTrackList from "./LibraryTrackList";

type Props = {
  initialQuery?: string;
  history?: string[];
  onRemember?: (query: string) => void;
  onForget?: (query: string) => void;
};

/** YouTube results that start loading as soon as a search returns. */
const PREFETCH_RESULTS = 5;

// Memoised: the shell re-renders with every playback report.
export default memo(MusicSearch);

function MusicSearch({ initialQuery = "", history = [], onRemember, onForget }: Props) {
  const connected = useYouTubeConnection();
  const [source, setSource] = useState<MusicProviderType>("spotify");
  const [query, setQuery] = useState(initialQuery);
  const [tracks, setTracks] = useState<UnifiedTrack[]>([]);
  const [continuation, setContinuation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const showHistory = !query.trim() && history.length > 0;
  useEffect(() => {
    if (!connected && source === "youtube") setSource("spotify");
  }, [connected, source]);
  useEffect(() => {
    const run = ++revision.current;
    setTracks([]);
    setContinuation(null);
    setError(null);
    setLoading(false);
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      setLoading(true);
      void (
        source === "youtube"
          ? searchYouTube(query.trim())
          : createSpotifyProvider()
              .searchTracks(query.trim(), 30)
              .then((tracks) => ({ tracks, continuation: null }))
      )
        .then((result) => {
          if (run === revision.current) {
            setTracks(result.tracks);
            setContinuation(result.continuation);
            // The top hits are the likeliest clicks; their audio starts loading now.
            prefetchYouTubeAudio(
              result.tracks
                .filter((track) => track.provider === "youtube")
                .slice(0, PREFETCH_RESULTS)
                .map((track) => track.id)
            );
          }
        })
        .catch((e) => {
          if (run === revision.current) setError(String(e));
        })
        .finally(() => {
          if (run === revision.current) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      revision.current++;
    };
  }, [query, source]);
  async function more() {
    if (!continuation || loading) return;
    const run = revision.current;
    setLoading(true);
    try {
      const result = await searchYouTube(query.trim(), continuation);
      if (run === revision.current) {
        setTracks((old) => [
          ...old,
          ...result.tracks.filter((t) => !old.some((o) => o.uri === t.uri)),
        ]);
        setContinuation(result.continuation);
      }
    } catch (e) {
      if (run === revision.current) setError(String(e));
    } finally {
      if (run === revision.current) setLoading(false);
    }
  }
  return (
    <section className="library-search">
      <div className="library-search-toolbar">
        <fieldset className="library-source-tabs" aria-label="Search source">
          <button
            type="button"
            className="is-spotify"
            aria-pressed={source === "spotify"}
            onClick={() => setSource("spotify")}
          >
            <SpotifyLogo size={18} />
            Spotify
          </button>
          <button
            type="button"
            className="is-youtube"
            aria-pressed={source === "youtube"}
            disabled={!connected}
            title={connected ? "YouTube" : "Sign in to YouTube under Settings → Connections"}
            onClick={() => setSource("youtube")}
          >
            <YoutubeLogo size={18} />
            YouTube
          </button>
        </fieldset>
        <label className="library-search-input">
          <MagnifyingGlass size={20} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRemember?.(query);
            }}
            placeholder="Search"
            aria-label={`Search ${source === "youtube" ? "YouTube" : "Spotify"}`}
          />
          {loading && <SpinnerGap size={18} className="animate-spin" />}
        </label>
      </div>
      {error && (
        <p role="alert" className="library-error">
          {error}
        </p>
      )}
      {showHistory ? (
        <div className="desktop-search-history">
          <div className="desktop-section-heading">
            <h2>Recent searches</h2>
          </div>
          <ul>
            {history.map((term) => (
              <li key={term}>
                <button type="button" onClick={() => setQuery(term)}>
                  <ClockCounterClockwise size={16} weight="bold" />
                  <span>{term}</span>
                </button>
                {onForget && (
                  <button
                    type="button"
                    className="desktop-search-history-remove"
                    onClick={() => onForget(term)}
                    aria-label={`Remove ${term} from recent searches`}
                  >
                    <X size={14} weight="bold" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <LibraryTrackList
            tracks={tracks}
            showAdd
            onSearch={setQuery}
            onPlay={(track) => {
              onRemember?.(query);
              void playbackCommand({ action: "track", track }).catch((e) => setError(String(e)));
            }}
          />
          {!loading && !tracks.length && (
            <p className="library-empty">{query.trim() ? "No results" : "Search music"}</p>
          )}
          {continuation && (
            <button
              type="button"
              className="library-load-more"
              disabled={loading}
              onClick={() => void more()}
            >
              Load more
            </button>
          )}
        </>
      )}
    </section>
  );
}
