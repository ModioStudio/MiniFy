import { ArrowSquareOut, MusicNotes, X } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { activeLineIndex, fetchLyrics, type Lyrics } from "../../lib/lyrics";
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
  onClose: () => void;
};

function releaseYear(date: string | null): string | null {
  return date ? (date.split("-")[0] ?? null) : null;
}

/**
 * The right-hand companion to the player: cover, the facts Spotify still hands
 * out, the track's video on YouTube, and lyrics from LRCLIB that follow along
 * when a timed transcript exists.
 */
export default function NowPlayingPanel({ track, progressMs, onClose }: NowPlayingPanelProps) {
  const [album, setAlbum] = useState<AlbumFacts | null>(null);
  const [video, setVideo] = useState<MusicVideo | null>(null);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);

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
      setLyrics(null);
      return;
    }

    let mounted = true;
    setLyrics(null);
    setVideo(null);
    setLoadingLyrics(true);

    if (albumId) {
      void fetchAlbumFacts(albumId).then((facts) => {
        if (mounted) setAlbum(facts);
      });
    }

    void fetchMusicVideo(trackId, trackName, leadArtist ?? "").then((found) => {
      if (mounted) setVideo(found);
    });

    void fetchLyrics(trackName, leadArtist ?? "", albumName ?? "", durationMs)
      .then((found) => {
        if (mounted) setLyrics(found);
      })
      .finally(() => {
        if (mounted) setLoadingLyrics(false);
      });

    return () => {
      mounted = false;
    };
  }, [trackId, trackName, leadArtist, albumId, albumName, durationMs]);

  const lines = lyrics?.lines ?? null;
  const current = lines ? activeLineIndex(lines, progressMs) : -1;

  // Keep the sung line in view as playback moves through the transcript.
  useEffect(() => {
    if (current < 0) return;
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);

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
            {loadingLyrics && <p className="desktop-now-panel-hint">Looking for lyrics…</p>}
            {!loadingLyrics && lyrics?.instrumental && (
              <p className="desktop-now-panel-hint">Instrumental.</p>
            )}
            {!loadingLyrics && !lyrics && (
              <p className="desktop-now-panel-hint">No lyrics found for this track.</p>
            )}
            {lines ? (
              <div className="desktop-now-panel-synced">
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
            ) : (
              lyrics?.plain && <pre className="desktop-now-panel-plain">{lyrics.plain}</pre>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
