import { ArrowSquareOut, MusicNotes, X } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { activeLineIndex, fetchLyrics, type LyricLine, type Lyrics } from "../../lib/lyrics";
import {
  type AlbumFacts,
  fetchAlbumFacts,
  fetchMusicVideo,
  type MusicVideo,
  youtubeSearchUrl,
} from "../../lib/trackExtras";
import type { UnifiedTrack } from "../../providers/types";

type NowPlayingPanelProps = {
  track: UnifiedTrack | null;
  progressMs: number;
  isPlaying: boolean;
  onClose: () => void;
};

const CLOCK_TICK_MS = 200;
/**
 * The reported position is already a network round trip old when it lands,
 * and a line reads as late when it lights up exactly on its first syllable.
 */
const LYRIC_LEAD_MS = 300;
/** How long autoscroll stays out of the way after the user scrolls lyrics. */
const MANUAL_SCROLL_HOLD_MS = 4000;
/** Next try after LRCLIB stayed unavailable through its own retries. */
const LYRICS_RETRY_MS = 20_000;

function releaseYear(date: string | null): string | null {
  return date ? (date.split("-")[0] ?? null) : null;
}

/**
 * Playback position advanced locally between reports. The shell only learns
 * the position from a 2.5s poll and SDK events, so reading it raw leaves the
 * highlight up to a full poll — about one lyric line — behind.
 */
function useLiveProgress(progressMs: number, isPlaying: boolean, durationMs: number): number {
  const [live, setLive] = useState(progressMs);

  useEffect(() => {
    setLive(progressMs);
    if (!isPlaying) return;

    const anchoredAt = performance.now();
    const end = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
    const id = window.setInterval(() => {
      setLive(Math.min(end, progressMs + performance.now() - anchoredAt));
    }, CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, [progressMs, isPlaying, durationMs]);

  return live;
}

type SyncedLyricsProps = {
  lines: LyricLine[];
  progressMs: number;
  isPlaying: boolean;
  durationMs: number;
};

/**
 * Its own component so the 200ms clock re-renders the lyrics, not the video
 * and artwork above them.
 */
function SyncedLyrics({ lines, progressMs, isPlaying, durationMs }: SyncedLyricsProps) {
  const position = useLiveProgress(progressMs, isPlaying, durationMs);
  const current = activeLineIndex(lines, position + LYRIC_LEAD_MS);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const manualScrollAt = useRef(0);

  // Scrolls the box itself. `scrollIntoView` would also scroll every ancestor,
  // dragging the whole panel along with the lyrics.
  useEffect(() => {
    const box = boxRef.current;
    const line = activeLineRef.current;
    if (current < 0 || !box || !line) return;
    if (Date.now() - manualScrollAt.current < MANUAL_SCROLL_HOLD_MS) return;

    box.scrollTo({
      top: line.offsetTop - box.clientHeight / 2 + line.offsetHeight / 2,
      behavior: "smooth",
    });
  }, [current]);

  const holdAutoscroll = () => {
    manualScrollAt.current = Date.now();
  };

  return (
    <div
      ref={boxRef}
      className="desktop-now-panel-lyrics-box desktop-now-panel-synced"
      onWheel={holdAutoscroll}
      onPointerDown={holdAutoscroll}
    >
      {lines.map((line, index) => (
        <p
          key={`${line.timeMs}-${line.text}`}
          ref={index === current ? activeLineRef : null}
          className={index === current ? "is-active" : index < current ? "is-past" : ""}
        >
          {line.text || "♪"}
        </p>
      ))}
    </div>
  );
}

/**
 * The right-hand companion to the player: cover, the facts Spotify still hands
 * out, the track's video on YouTube, and lyrics from LRCLIB that follow along
 * when a timed transcript exists.
 */
export default function NowPlayingPanel({
  track,
  progressMs,
  isPlaying,
  onClose,
}: NowPlayingPanelProps) {
  const [album, setAlbum] = useState<AlbumFacts | null>(null);
  const [video, setVideo] = useState<MusicVideo | null>(null);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [lyricsBusy, setLyricsBusy] = useState(false);

  const artistText = track?.artists.map((artist) => artist.name).join(", ") ?? "";
  const artwork = track?.album.images[0]?.url ?? null;

  // Primitives, not the track object: the playback poll hands out a fresh object
  // every couple of seconds, which would restart every lookup.
  const trackId = track?.id ?? null;
  const trackName = track?.name ?? null;
  const leadArtist = track?.artists[0]?.name ?? null;
  const albumId = track?.album.id ?? null;
  const albumName = track?.album.name ?? null;
  const durationMs = track?.durationMs ?? 0;

  useEffect(() => {
    if (!trackId || !trackName) {
      setAlbum(null);
      setVideo(null);
      return;
    }

    let mounted = true;
    setVideo(null);

    if (albumId) {
      void fetchAlbumFacts(albumId).then((facts) => {
        if (mounted) setAlbum(facts);
      });
    }

    void fetchMusicVideo(trackId, trackName, leadArtist ?? "").then((found) => {
      if (mounted) setVideo(found);
    });

    return () => {
      mounted = false;
    };
  }, [trackId, trackName, leadArtist, albumId]);

  // Its own effect so a retry does not reload the video along with it.
  useEffect(() => {
    if (!trackId || !trackName) {
      setLyrics(null);
      setLoadingLyrics(false);
      setLyricsBusy(false);
      return;
    }

    let mounted = true;
    let retryTimer: number | undefined;
    setLyrics(null);
    setLyricsBusy(false);
    setLoadingLyrics(true);

    const load = () => {
      fetchLyrics(trackName, leadArtist ?? "", albumName ?? "", durationMs)
        .then((found) => {
          if (!mounted) return;
          setLyrics(found);
          setLyricsBusy(false);
          setLoadingLyrics(false);
        })
        .catch(() => {
          if (!mounted) return;
          // LRCLIB can stay overloaded for minutes. A track that has lyrics
          // should still get them, so keep asking while it plays.
          setLyricsBusy(true);
          retryTimer = window.setTimeout(load, LYRICS_RETRY_MS);
        });
    };
    load();

    return () => {
      mounted = false;
      window.clearTimeout(retryTimer);
    };
  }, [trackId, trackName, leadArtist, albumName, durationMs]);

  const lines = lyrics?.lines ?? null;

  return (
    <aside className="desktop-now-panel">
      <div className="desktop-now-panel-head">
        <h2>Now playing</h2>
        <button type="button" onClick={onClose} aria-label="Close now playing panel">
          <X size={16} weight="bold" />
        </button>
      </div>

      {!track ? (
        <div className="desktop-now-panel-empty">
          <MusicNotes size={28} weight="duotone" />
          <p>Nothing is playing.</p>
        </div>
      ) : (
        <div className="desktop-now-panel-body">
          <div className="desktop-now-panel-art">
            {artwork ? <img src={artwork} alt="" /> : <MusicNotes size={40} weight="duotone" />}
          </div>

          <div className="desktop-now-panel-meta">
            <h3>{track.name}</h3>
            <p>{artistText}</p>
            <dl>
              <div>
                <dt>Album</dt>
                <dd>{track.album.name}</dd>
              </div>
              {album?.releaseDate && (
                <div>
                  <dt>Released</dt>
                  <dd>{releaseYear(album.releaseDate)}</dd>
                </div>
              )}
              {album?.totalTracks ? (
                <div>
                  <dt>Tracks</dt>
                  <dd>{album.totalTracks}</dd>
                </div>
              ) : null}
              {album?.label && (
                <div>
                  <dt>Label</dt>
                  <dd>{album.label}</dd>
                </div>
              )}
            </dl>
          </div>

          <section className="desktop-now-panel-section">
            <h4>Video</h4>
            {video ? (
              <>
                {/* Muted on purpose: Spotify owns the audio, this is the
                    picture. Unmute in the player if you want YouTube's. */}
                <div className="desktop-now-panel-video">
                  <iframe
                    title={video.title}
                    src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&mute=1&playsinline=1&modestbranding=1`}
                    allow="accelerometer; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="desktop-now-panel-hint">Muted — Spotify is playing the audio.</p>
              </>
            ) : (
              <button
                type="button"
                className="desktop-now-panel-link"
                onClick={() => openUrl(youtubeSearchUrl(track.name, track.artists[0]?.name ?? ""))}
              >
                <ArrowSquareOut size={14} weight="bold" />
                Search on YouTube
              </button>
            )}
          </section>

          <section className="desktop-now-panel-section desktop-now-panel-lyrics">
            <h4>Lyrics</h4>
            {lyricsBusy ? (
              <p className="desktop-now-panel-hint">The lyrics service is busy. Trying again…</p>
            ) : (
              loadingLyrics && <p className="desktop-now-panel-hint">Looking for lyrics…</p>
            )}
            {!loadingLyrics && lyrics?.instrumental && (
              <p className="desktop-now-panel-hint">Instrumental.</p>
            )}
            {!loadingLyrics && !lyrics && (
              <p className="desktop-now-panel-hint">No lyrics found for this track.</p>
            )}
            {lines ? (
              // Keyed by track so a new song starts at the top of its lyrics.
              <SyncedLyrics
                key={trackId}
                lines={lines}
                progressMs={progressMs}
                isPlaying={isPlaying}
                durationMs={durationMs}
              />
            ) : (
              lyrics?.plain && (
                <pre className="desktop-now-panel-lyrics-box desktop-now-panel-plain">
                  {lyrics.plain}
                </pre>
              )
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
