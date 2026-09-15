import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { logDiagnostic } from "../../lib/diagnostics";
import { findMusicVideos, type VideoCandidate } from "../../lib/musicVideo";
import { onRendererStall } from "../../lib/watchdog";
import { loadYouTubeIframeApi } from "../../lib/youtubeIframe";
import type { UnifiedTrack } from "../../providers/types";

type MusicVideoProps = {
  track: UnifiedTrack;
  progressMs: number;
  isPlaying: boolean;
  /**
   * Lays the player out at half size and scales it up. YouTube picks its
   * stream by the player's size, so a large, dimmed backdrop then decodes a
   * lighter quality instead of full HD.
   */
  lowRes?: boolean;
};

/** The part of the IFrame API player this component drives. */
type VideoPlayer = {
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  mute(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  /** Undocumented, but the only switch captions actually obey. */
  unloadModule?(name: string): void;
  destroy(): void;
};

type VideoPlayerConstructor = new (
  element: HTMLElement,
  options: {
    width: string;
    height: string;
    host: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: () => void;
      onStateChange: (event: { data: number }) => void;
      onError: (event: { data: number }) => void;
      onApiChange: () => void;
    };
  }
) => VideoPlayer;

const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;
const SYNC_MS = 500;
/** Further apart than this, the video is moved to where the song is. */
const DRIFT_S = 2.5;
/** Every move is a fresh buffer; never more often than this. */
const SEEK_RETRY_MS = 4000;
/**
 * Whenever playback starts or resumes, YouTube draws its title bar and a
 * play animation for a few seconds, even with controls off. The video only
 * shows once they are gone.
 */
const REVEAL_AFTER_START_MS = 3500;
/** A stall only adds a spinner, which is gone as soon as frames move again. */
const REVEAL_AFTER_STALL_MS = 800;
/** An ad runs under the same player; its length gives it away. */
const AD_TOLERANCE_S = 3;
/** Hidden this early so YouTube's end screen never shows. */
const END_GUARD_S = 1.5;
/** Removed, private, or not allowed to be embedded: try the next result. */
const UNPLAYABLE = new Set([2, 5, 100, 101, 150, 153]);
/**
 * How long a song has to stay current before YouTube hears about it.
 * Skipping through tracks then never reaches the embedded player at all.
 */
const SETTLE_MS = 800;
/** A player that bounces back to paused must not be asked again every event. */
const PLAY_RETRY_MS = 1500;
/** More player events than this within the window means it is going in circles. */
const CHURN_LIMIT = 40;
const CHURN_WINDOW_MS = 10_000;
/** Page freezes while a video is loaded before videos are off for the session. */
const STALLS_BEFORE_OFF = 2;

let offForSession = false;
const offListeners = new Set<() => void>();

/**
 * The last line of defence: the app must stay usable, the video is optional.
 * The log then shows whether the freezes stop with it.
 */
function switchOffForSession(reason: string): void {
  if (offForSession) return;
  offForSession = true;
  logDiagnostic("video", `music videos off until MiniFy restarts: ${reason}`);
  for (const listener of offListeners) listener();
}

function subscribeOff(listener: () => void): () => void {
  offListeners.add(listener);
  return () => {
    offListeners.delete(listener);
  };
}

const isOff = () => offForSession;

/**
 * The song's music video, muted, following Spotify's position, play and
 * pause. It is only visible while the video itself plays cleanly — never the
 * loading spinner, YouTube's title bar, captions, an ad or the end screen —
 * and the pointer never reaches it, so none of YouTube's controls appear.
 */
export default function MusicVideo(props: MusicVideoProps) {
  const off = useSyncExternalStore(subscribeOff, isOff);
  // Unmounting is what frees YouTube's iframe; hiding it would keep it running.
  return off ? null : <MusicVideoPlayer {...props} />;
}

/**
 * Nothing here re-renders on the playback clock: the song position is read
 * from an anchor when the half-second sync runs, so the video costs the app
 * no work between reports.
 */
function MusicVideoPlayer({ track, progressMs, isPlaying, lowRes = false }: MusicVideoProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<VideoPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [candidates, setCandidates] = useState<VideoCandidate[] | null>(null);
  const [choice, setChoice] = useState(0);

  const candidate = candidates?.[choice] ?? null;
  const videoId = candidate?.videoId ?? null;
  const trackId = track.id;

  // Anchored when a report arrives, advanced by the clock when read.
  const clock = useRef({ progressMs, at: performance.now(), isPlaying });
  useEffect(() => {
    clock.current = { progressMs, at: performance.now(), isPlaying };
  }, [progressMs, isPlaying]);

  const live = useRef({ candidate, track });
  live.current = { candidate, track };

  const shown = useRef(false);
  const lastPlayRequest = useRef(0);
  const lastSeek = useRef(0);
  const churn = useRef<number[]>([]);
  const stalls = useRef(0);
  /** When the video last started moving; `null` while it is not. */
  const playingSince = useRef<number | null>(null);
  const revealDelay = useRef(REVEAL_AFTER_START_MS);

  const setShown = (next: boolean) => {
    shown.current = next;
    setVisible(next);
  };

  const hide = () => {
    playingSince.current = null;
    setShown(false);
  };

  const songSeconds = () => {
    const { progressMs: base, at, isPlaying: playing } = clock.current;
    const ms = playing ? base + performance.now() - at : base;
    const end = live.current.track.durationMs;
    return Math.max(0, end > 0 ? Math.min(ms, end) : ms) / 1000;
  };

  // cc_load_policy=0 is only a request; an account set to always show
  // captions still gets them.
  const silenceCaptions = () => {
    try {
      playerRef.current?.unloadModule?.("captions");
      playerRef.current?.unloadModule?.("cc");
    } catch {
      // Not loaded yet; the next API change comes back here.
    }
  };

  const sync = () => {
    const player = playerRef.current;
    const current = live.current.candidate;
    if (!player || !current) return;

    const state = player.getPlayerState();
    const duration = player.getDuration();
    const target = songSeconds();

    // Song paused, or MiniFy out of sight: nothing to show, nothing to decode.
    if (!clock.current.isPlaying || document.hidden) {
      hide();
      if (state === PLAYING) player.pauseVideo();
      revealDelay.current = REVEAL_AFTER_START_MS;
      return;
    }

    // The song outlasts the video: hold on the cover, not the end screen.
    if (duration > 0 && target >= duration - END_GUARD_S) {
      hide();
      if (state === PLAYING) player.pauseVideo();
      return;
    }

    if (state === BUFFERING) {
      hide();
      return;
    }

    if (state !== PLAYING) {
      hide();
      revealDelay.current = REVEAL_AFTER_START_MS;
      if (performance.now() - lastPlayRequest.current < PLAY_RETRY_MS) return;
      lastPlayRequest.current = performance.now();
      if (state === ENDED) player.seekTo(target, true);
      player.playVideo();
      return;
    }

    const isAd =
      current.durationS !== null && Math.abs(duration - current.durationS) > AD_TOLERANCE_S;
    if (isAd) {
      hide();
      return;
    }

    const now = player.getCurrentTime();
    if (Math.abs(now - target) > DRIFT_S && performance.now() - lastSeek.current > SEEK_RETRY_MS) {
      lastSeek.current = performance.now();
      player.seekTo(target, true);
      return;
    }
    if (now >= duration - END_GUARD_S) {
      hide();
      return;
    }

    playingSince.current ??= performance.now();
    if (!shown.current && performance.now() - playingSince.current >= revealDelay.current) {
      setShown(true);
    }
  };

  /** True when the player has been going in circles and was stopped. */
  const tooBusy = () => {
    const now = performance.now();
    churn.current = churn.current.filter((at) => now - at < CHURN_WINDOW_MS);
    churn.current.push(now);
    if (churn.current.length <= CHURN_LIMIT) return false;

    churn.current = [];
    logDiagnostic(
      "video",
      `player changed state over ${CHURN_LIMIT} times in ${CHURN_WINDOW_MS / 1000}s on ${live.current.candidate?.videoId}; skipping that video`
    );
    hide();
    setChoice((index) => index + 1);
    return true;
  };

  const handlers = useRef({ sync, hide, songSeconds, silenceCaptions, tooBusy });
  handlers.current = { sync, hide, songSeconds, silenceCaptions, tooBusy };

  // One player for the component's lifetime; tracks swap videos inside it.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    // Created by hand: the API replaces this element with its iframe, and
    // React must not be the one holding it.
    const mount = document.createElement("div");
    host.appendChild(mount);

    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled) return;
        const Player = (window as Window & typeof globalThis & { YT: { Player: unknown } }).YT
          .Player as unknown as VideoPlayerConstructor;
        playerRef.current = new Player(mount, {
          width: "100%",
          height: "100%",
          // youtube.com, not youtube-nocookie.com: only its cookies carry the
          // signed-in session, and with it YouTube Premium's missing ads.
          host: "https://www.youtube.com",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            rel: 0,
            playsinline: 1,
            mute: 1,
            cc_load_policy: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              handlers.current.silenceCaptions();
              setReady(true);
            },
            onStateChange: (event) => {
              if (handlers.current.tooBusy()) return;
              // A stall after the video was already showing only needs the
              // spinner gone, not the long wait for YouTube's title bar.
              if (event.data === BUFFERING && shown.current) {
                revealDelay.current = REVEAL_AFTER_STALL_MS;
              }
              if (event.data === PLAYING) handlers.current.silenceCaptions();
              if (event.data === ENDED) handlers.current.hide();
              handlers.current.sync();
            },
            onError: (event) => {
              handlers.current.hide();
              if (UNPLAYABLE.has(event.data)) setChoice((index) => index + 1);
            },
            onApiChange: () => handlers.current.silenceCaptions(),
          },
        });
      })
      .catch((error) => console.warn("Music video player unavailable:", error));

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
  }, []);

  // If the page freezes while a video is loaded, the video is the prime
  // suspect. After STALLS_BEFORE_OFF of them, videos go off for the session.
  useEffect(
    () =>
      onRendererStall((ms) => {
        if (!live.current.candidate) return;
        stalls.current += 1;
        logDiagnostic(
          "video",
          `page froze ${Math.round(ms)} ms with a video loaded (${stalls.current}/${STALLS_BEFORE_OFF})`
        );
        if (stalls.current >= STALLS_BEFORE_OFF) {
          switchOffForSession(`${stalls.current} page freezes while a video was loaded`);
        }
      }),
    []
  );

  useEffect(() => {
    let current = true;
    setCandidates(null);
    setChoice(0);
    handlers.current.hide();

    const timer = window.setTimeout(() => {
      findMusicVideos(live.current.track)
        .then((found) => {
          if (current) setCandidates(found);
        })
        .catch((error) => {
          console.warn(`No music video for ${trackId}:`, error);
          if (current) setCandidates([]);
        });
    }, SETTLE_MS);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [trackId]);

  useEffect(() => {
    const player = playerRef.current;
    handlers.current.hide();
    if (!ready || !player) return;
    if (!videoId) {
      player.stopVideo();
      return;
    }

    // Starts where the song is, so a video switched on mid-song lines up.
    revealDelay.current = REVEAL_AFTER_START_MS;
    lastSeek.current = performance.now();
    const options = { videoId, startSeconds: handlers.current.songSeconds() };
    if (clock.current.isPlaying && !document.hidden) player.loadVideoById(options);
    else player.cueVideoById(options);
    player.mute();
  }, [ready, videoId]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => handlers.current.sync(), SYNC_MS);
    const onVisibility = () => handlers.current.sync();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready]);

  // Play and pause land at once, not on the next sync tick.
  useEffect(() => {
    if (ready && isPlaying !== undefined) handlers.current.sync();
  }, [ready, isPlaying]);

  return (
    <div
      className={`music-video ${visible ? "is-visible" : ""} ${lowRes ? "is-low-res" : ""}`}
      aria-hidden="true"
    >
      <div ref={hostRef} className="music-video-frame" />
    </div>
  );
}
