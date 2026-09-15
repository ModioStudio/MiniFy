import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertToUnifiedTrack, createSpotifyProvider } from "../../providers/spotify";
import type { UnifiedTrack } from "../../providers/types";
import { transferPlayback } from "../../ui/spotifyClient";
import { stopAIQueue } from "../aiQueueService";
import type { LocalPlaylist, PlaylistChange, PlaylistEntry } from "../localLibrary";
import { toOutputVolume } from "../outputVolume";
import { readSettings } from "../settingLib";
import {
  activateSpotifyWebPlayback,
  isSpotifyWebPlaybackReady,
  subscribeSpotifyLocalPlayback,
} from "../spotifyWebPlayback";
import { getSpotifyWebPlaybackDeviceId } from "../spotifyWebPlaybackDevice";
import { prefetchYouTubeAudio } from "../youtube";
import { type PlaybackSession, usePlaybackSession } from "./sessionStore";
import { skipToNext } from "./spotifyAutoplay";

export type PlaybackCommand =
  | { action: "track"; track: UnifiedTrack; positionMs?: number }
  | { action: "playlist"; playlist: LocalPlaylist; entryId: string; shuffle?: boolean }
  | { action: "playing"; playing: boolean }
  | { action: "seek"; positionMs: number }
  | { action: "volume"; volume: number }
  | { action: "shuffle"; enabled: boolean }
  | { action: "next" | "previous" | "state" | "stop" };

type AudioStream = { streamId: string; url: string };

const MAIN = getCurrentWindow().label === "main";
/** Commands that replace whatever is playing or still loading. */
const SUPERSEDING = new Set<PlaybackCommand["action"]>([
  "track",
  "playlist",
  "stop",
  "next",
  "previous",
]);
let initialized: Promise<void> | null = null;
let audio: HTMLAudioElement | null = null;
let streamId: string | null = null;
let serial = Promise.resolve();
let generation = 0;
/**
 * Ends the wait on YouTube's resolver once a newer command takes over. Every
 * later command used to queue behind a slow resolve, which looked like a hang.
 */
let supersede: (() => void) | null = null;
let history: string[] = [];
let heard = new Set<string>();
/** The shuffle pick for "next", chosen early so its audio can load ahead. */
let planned: string | null = null;
let ended = false;
let retry = false;
const state = () => usePlaybackSession.getState();
const spotify = createSpotifyProvider();

/** How often a routine position update reaches the store and the other windows. */
const PROGRESS_EVERY_MS = 1000;
let broadcastTimer: ReturnType<typeof setTimeout> | undefined;
let lastBroadcast = 0;

function broadcast() {
  broadcastTimer = undefined;
  lastBroadcast = performance.now();
  // Without the playlist: it can hold thousands of songs, and sending all of
  // it to every window on every tick jammed the webview transport.
  const { playlist: _playlist, ...light } = state();
  void emit("playback-session-state", light);
}

/** `progress` marks a routine position update, which other windows get batched. */
function publish(update: Partial<PlaybackSession>, progress = false) {
  usePlaybackSession.setState(update);
  if (!MAIN) return;
  if (!progress) {
    clearTimeout(broadcastTimer);
    broadcast();
  } else if (broadcastTimer === undefined) {
    const wait = Math.max(0, PROGRESS_EVERY_MS - (performance.now() - lastBroadcast));
    broadcastTimer = setTimeout(broadcast, wait);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function takeOver() {
  generation++;
  supersede?.();
  supersede = null;
}

async function releaseAudio() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  const id = streamId;
  streamId = null;
  if (id) void invoke("release_youtube_audio", { streamId: id }).catch(() => {});
}

async function pauseSpotify() {
  const current = await spotify.getPlaybackState().catch(() => null);
  if (current?.isPlaying) await spotify.pause().catch(() => {});
}

/** The entry "next" would play: in order, or the shuffle pick made ahead of time. */
function upcoming(): PlaylistEntry | undefined {
  const current = state();
  const entries = current.playlist?.entries ?? [];
  if (!current.local || entries.length === 0) return undefined;
  if (!current.shuffle) {
    return entries[entries.findIndex((entry) => entry.entryId === current.entryId) + 1];
  }
  const usable = (id: string | null) =>
    id !== null &&
    id !== current.entryId &&
    !heard.has(id) &&
    entries.some((entry) => entry.entryId === id);
  if (!usable(planned)) {
    const options = entries.filter(
      (entry) => entry.entryId !== current.entryId && !heard.has(entry.entryId)
    );
    planned = options[Math.floor(Math.random() * options.length)]?.entryId ?? null;
  }
  return entries.find((entry) => entry.entryId === planned);
}

function prefetchUpcoming() {
  const next = upcoming();
  if (next?.track.provider === "youtube") prefetchYouTubeAudio(next.track.id);
}

async function playEntry(track: UnifiedTrack, positionMs = 0, fresh = false) {
  const run = generation;
  publish({
    loading: true,
    error: null,
    playback: { track, progressMs: positionMs, isPlaying: false },
  });
  ended = false;
  retry = false;
  try {
    await releaseAudio();
    if (track.provider === "youtube") {
      const player = audio;
      if (!player) throw new Error("The player is not ready yet");
      const resolving = invoke<AudioStream>("resolve_youtube_audio", { videoId: track.id, fresh });
      const superseded = new Promise<null>((resolve) => {
        supersede = () => resolve(null);
      });
      // Spotify is paused alongside and never waited for: its two round trips
      // used to come on top of the resolve.
      void pauseSpotify();
      const stream = await Promise.race([resolving, superseded]);
      if (!stream || run !== generation) {
        void resolving
          .then((late) => invoke("release_youtube_audio", { streamId: late.streamId }))
          .catch(() => {});
        return;
      }
      streamId = stream.streamId;
      player.src = stream.url;
      player.currentTime = positionMs / 1000;
      await player.play();
      if (run !== generation) {
        await releaseAudio();
        return;
      }
    } else {
      await spotify.playTrack(track.uri, positionMs);
    }
    if (run === generation) {
      publish({ loading: false, playback: { track, progressMs: positionMs, isPlaying: true } });
      prefetchUpcoming();
    }
  } catch (error) {
    if (run !== generation) return;
    publish({
      loading: false,
      error: errorMessage(error),
      playback: { track, progressMs: positionMs, isPlaying: false },
    });
    throw error;
  }
}

async function advance(previous: boolean) {
  const current = state();
  if (!current.local) {
    if (previous) await spotify.previousTrack();
    else await skipToNext();
    return;
  }
  if (previous && (current.playback?.progressMs ?? 0) > 3000) {
    if (current.playback?.track?.provider === "youtube" && audio) audio.currentTime = 0;
    else await spotify.seek(0);
    return;
  }
  const entries = current.playlist?.entries ?? [];
  let entry: PlaylistEntry | undefined;
  if (previous) {
    if (current.shuffle) {
      const id = history.pop();
      entry = entries.find((e) => e.entryId === id);
    } else {
      entry = entries[entries.findIndex((e) => e.entryId === current.entryId) - 1];
    }
  } else {
    if (current.shuffle && current.entryId) heard.add(current.entryId);
    entry = upcoming();
    planned = null;
  }
  if (!entry) {
    if (current.playback?.track?.provider === "youtube") audio?.pause();
    else await spotify.pause();
    publish({ playback: current.playback ? { ...current.playback, isPlaying: false } : null });
    return;
  }
  if (!previous && current.entryId) history.push(current.entryId);
  publish({ entryId: entry.entryId });
  await playEntry(entry.track);
}

async function execute(command: PlaybackCommand) {
  switch (command.action) {
    case "state":
      publish({});
      return;
    case "track": {
      stopAIQueue();
      publish({ local: true, playlist: null, playlistId: null, entryId: null });
      await playEntry(command.track, command.positionMs);
      if (command.track.provider === "spotify") publish({ local: false, playback: null });
      return;
    }
    case "playlist": {
      const entry = command.playlist.entries.find((e) => e.entryId === command.entryId);
      if (!entry) throw new Error("Playlist entry no longer exists");
      if (command.playlist.entries.some((e) => e.track.provider === "youtube")) {
        const id = getSpotifyWebPlaybackDeviceId();
        if (!id || !isSpotifyWebPlaybackReady())
          throw new Error(
            "Mixed playlists need Spotify playback in MiniFy. Connect Spotify Premium and select MiniFy as the device."
          );
        await activateSpotifyWebPlayback();
        await transferPlayback(id, false);
      }
      stopAIQueue();
      history = [];
      heard = new Set();
      planned = null;
      publish({
        local: true,
        playlist: command.playlist,
        playlistId: command.playlist.playlistId,
        entryId: entry.entryId,
        shuffle: command.shuffle ?? false,
      });
      await playEntry(entry.track);
      return;
    }
    case "next":
      await advance(false);
      return;
    case "previous":
      await advance(true);
      return;
    case "stop":
      await releaseAudio();
      publish({
        local: false,
        playlist: null,
        playlistId: null,
        entryId: null,
        playback: null,
        error: null,
        loading: false,
      });
      return;
    case "volume":
      if (audio) audio.volume = Math.max(0, Math.min(1, toOutputVolume(command.volume) / 100));
      if (state().playback?.track?.provider !== "youtube") await spotify.setVolume(command.volume);
      return;
    case "shuffle":
      publish({ shuffle: command.enabled });
      heard = new Set();
      planned = null;
      prefetchUpcoming();
      return;
    case "seek":
      if (state().local && state().playback?.track?.provider === "youtube" && audio)
        audio.currentTime = Math.max(0, command.positionMs) / 1000;
      else await spotify.seek(command.positionMs);
      return;
    case "playing": {
      const current = state();
      const track = current.playback?.track;
      if (current.local && track?.provider === "youtube") {
        if (!command.playing) audio?.pause();
        else if (!streamId || current.error) {
          await playEntry(track, current.playback?.progressMs ?? 0);
          return;
        } else await audio?.play();
      } else if (command.playing) await spotify.play();
      else await spotify.pause();
      const playback = state().playback;
      if (current.local && playback)
        publish({ loading: false, playback: { ...playback, isPlaying: command.playing } });
    }
  }
}

function enqueue(command: PlaybackCommand): Promise<void> {
  const pausingLoad = command.action === "playing" && !command.playing && state().loading;
  if (SUPERSEDING.has(command.action) || pausingLoad) takeOver();
  // Nothing to wait for: a volume drag must not queue behind a song still loading.
  if (command.action === "volume" || command.action === "state") return execute(command);
  const result = serial.then(() => execute(command));
  serial = result.catch((error) => {
    publish({ loading: false, error: errorMessage(error) });
  });
  return result;
}

export function initializePlaybackSession(): Promise<void> {
  initialized ??= (async () => {
    if (!MAIN) {
      await listen<PlaybackSession>("playback-session-state", ({ payload }) =>
        usePlaybackSession.setState(payload)
      );
      await emitTo("main", "playback-session-command", { command: { action: "state" } });
      return;
    }
    const player = new Audio();
    audio = player;
    player.preload = "auto";
    // The bar runs its own clock between reports, so the position needs one
    // report a second; timeupdate fires four times as often.
    let reportedAt = 0;
    const syncAudio = (event: Event) => {
      const current = state();
      if (!streamId || current.playback?.track?.provider !== "youtube") return;
      const isPlaying = !player.paused && !player.ended;
      const routine = event.type === "timeupdate" && isPlaying === current.playback.isPlaying;
      if (routine && performance.now() - reportedAt < PROGRESS_EVERY_MS) return;
      reportedAt = performance.now();
      publish(
        { playback: { ...current.playback, progressMs: player.currentTime * 1000, isPlaying } },
        routine
      );
    };
    for (const event of ["timeupdate", "play", "pause", "seeked"])
      player.addEventListener(event, syncAudio);
    player.addEventListener("ended", () => {
      if (!ended) {
        ended = true;
        void enqueue({ action: "next" });
      }
    });
    player.addEventListener("error", () => {
      if (!streamId || state().loading) return;
      const current = state().playback;
      if (!current?.track || retry) {
        publish({
          error: "YouTube audio is unavailable. Try again.",
          playback: current ? { ...current, isPlaying: false } : null,
        });
        return;
      }
      retry = true;
      const track = current.track;
      // A cached stream URL can expire mid-song; the retry resolves a new one.
      const result = serial.then(async () => {
        await playEntry(track, current.progressMs, true);
        retry = true;
      });
      serial = result.catch(() => {});
    });
    await listen<{ id?: string; from?: string; command: PlaybackCommand }>(
      "playback-session-command",
      ({ payload }) => {
        void enqueue(payload.command).then(
          () =>
            payload.id && payload.from
              ? emitTo(payload.from, "playback-session-result", { id: payload.id })
              : undefined,
          (error) =>
            payload.id && payload.from
              ? emitTo(payload.from, "playback-session-result", {
                  id: payload.id,
                  error: errorMessage(error),
                })
              : undefined
        );
      }
    );
    // The event only says what changed; the playing playlist is read back.
    await listen<PlaylistChange>("local-playlist-changed", ({ payload }) => {
      const current = state().playlist;
      if (
        current?.playlistId !== payload.playlistId ||
        current.accountId !== payload.accountId ||
        current.revision >= payload.revision
      )
        return;
      void invoke<LocalPlaylist>("read_local_playlist", {
        accountId: payload.accountId,
        playlistId: payload.playlistId,
      })
        .then((playlist) => {
          if (state().playlist?.playlistId === playlist.playlistId) publish({ playlist });
        })
        .catch(() => {});
    });
    await listen<{ signedIn: boolean }>("youtube-web-sign-in", ({ payload }) => {
      const playback = state().playback;
      if (!payload.signedIn && playback?.track?.provider === "youtube") {
        takeOver();
        void releaseAudio();
        publish({
          loading: false,
          error: "Sign in to YouTube in Connections to resume.",
          playback: { ...playback, isPlaying: false },
        });
      }
    });
    subscribeSpotifyLocalPlayback((sample) => {
      const current = state();
      if (
        !current.local ||
        current.loading ||
        current.playback?.track?.provider !== "spotify" ||
        !sample?.track
      )
        return;
      if (sample.track.id !== current.playback.track.id) return;
      const previous = current.playback;
      publish(
        {
          playback: {
            track: convertToUnifiedTrack(sample.track),
            progressMs: sample.positionMs,
            isPlaying: !sample.paused,
          },
        },
        previous.isPlaying === !sample.paused
      );
      if (
        !ended &&
        sample.paused &&
        previous.isPlaying &&
        previous.progressMs >= sample.durationMs - 2500
      ) {
        ended = true;
        void enqueue({ action: "next" });
      }
    });
    const settings = await readSettings();
    player.volume = Math.max(0, Math.min(1, toOutputVolume(settings.spotify_volume ?? 50) / 100));
  })();
  return initialized;
}

export async function playbackCommand(command: PlaybackCommand): Promise<void> {
  await initializePlaybackSession();
  if (MAIN) return enqueue(command);
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let dispose: (() => void) | undefined;
    const timer = setTimeout(() => {
      dispose?.();
      reject(new Error("The main player did not respond"));
    }, 60000);
    void listen<{ id: string; error?: string }>("playback-session-result", ({ payload }) => {
      if (payload.id !== id) return;
      clearTimeout(timer);
      dispose?.();
      if (payload.error) reject(new Error(payload.error));
      else resolve();
    })
      .then((off) => {
        dispose = off;
        return emitTo("main", "playback-session-command", {
          id,
          from: getCurrentWindow().label,
          command,
        });
      })
      .catch((error) => {
        clearTimeout(timer);
        dispose?.();
        reject(error);
      });
  });
}
