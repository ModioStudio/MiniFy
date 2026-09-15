import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import { getActiveProvider, getActiveProviderType } from "../../providers";
import { convertToUnifiedTrack } from "../../providers/spotify";
import type { UnifiedTrack } from "../../providers/types";
import {
  fetchCurrentlyPlaying,
  getQueue,
  playTracks,
  type SimplifiedTrack,
} from "../../ui/spotifyClient";
import { useAIQueueStore } from "../aiQueueStore";
import { logDiagnostic } from "../diagnostics";
import { fetchRelatedTracks } from "../relatedTracks";
import {
  activateSpotifyWebPlayback,
  getSpotifyLocalPlayback,
  isSpotifyWebPlaybackReady,
  subscribeSpotifyLocalPlayback,
} from "../spotifyWebPlayback";
import { ensureActiveDevice } from "./spotifyKeepAlive";

/**
 * Spotify's autoplay, rebuilt on what the Web API still allows. Whatever was
 * playing — a single track from search, a playlist, an earlier radio — plays
 * to its end first. Only when it runs out does a radio built from the session
 * take over, and it keeps going: the last song of a radio starts the next one.
 *
 * The radio is started as its own `uris` context, never pushed onto the user
 * queue. Spotify plays the queue *before* the context and the Web API cannot
 * remove from it, so radio tracks left there would jump ahead of the next
 * playlist the user starts. As a context, next and previous work natively
 * and nothing is left behind.
 *
 * Spotify stops when a context runs out; that stop is the signal. On the SDK
 * device it arrives as an event, on remote devices through polling.
 */

type Sample = {
  track: UnifiedTrack;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  /** Wall clock the position was read at, to extrapolate between samples. */
  sampledAt: number;
  /** Tracks Spotify will play after this one; `null` when unknown. */
  upcoming: number | null;
};

/** Long enough that running out is rare, small enough to build quickly. */
const RADIO_SIZE = 40;
/** How close to its end a track must have got for a stop to mean "ran out". */
const END_SLACK_MS = 2500;
const POLL_MS = 2500;
/** A remote device's queue costs a request, so it is re-read at most this often. */
const QUEUE_RECHECK_MS = 8000;
const RETRY_MS = 5000;
const HISTORY_SIZE = 200;
/** Recent tracks whose artists also seed the radio, so it follows the session. */
const SEED_TRACKS = 5;

type AutoplayStore = {
  /** Tracks of the radio currently playing, for the "Autoplay" label. */
  radioTrackIds: ReadonlySet<string>;
  setRadio: (ids: string[]) => void;
};

export const useAutoplayStore = create<AutoplayStore>((set) => ({
  radioTrackIds: new Set(),
  setRadio: (ids) => set({ radioTrackIds: new Set(ids) }),
}));

let last: Sample | null = null;
let history: UnifiedTrack[] = [];
let prepared: { seedId: string; tracks: Promise<SimplifiedTrack[]> } | null = null;
let starting = false;
let retry: { seed: UnifiedTrack; at: number } | null = null;
let remoteQueue: { trackId: string; at: number; upcoming: number } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let ticking = false;
let tickAgain = false;

/** Throws when Spotify cannot be read; `null` when nothing is loaded. */
async function readSample(freshQueue = false): Promise<Sample | null> {
  const local = getSpotifyLocalPlayback();
  if (isSpotifyWebPlaybackReady() && local?.track) {
    return {
      track: convertToUnifiedTrack(local.track),
      isPlaying: !local.paused,
      positionMs: local.positionMs,
      durationMs: local.durationMs,
      sampledAt: local.sampledAt,
      upcoming: local.nextTrackCount,
    };
  }

  const data = await fetchCurrentlyPlaying();
  if (!data?.item) return null;
  const track = convertToUnifiedTrack(data.item);
  return {
    track,
    isPlaying: data.is_playing,
    positionMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms,
    sampledAt: Date.now(),
    upcoming: await remoteUpcoming(track.id, freshQueue),
  };
}

async function remoteUpcoming(trackId: string, fresh: boolean): Promise<number | null> {
  const cached = remoteQueue;
  if (!fresh && cached?.trackId === trackId && Date.now() - cached.at < QUEUE_RECHECK_MS) {
    return cached.upcoming;
  }

  try {
    const { queue } = await getQueue();
    // With nothing left, Spotify echoes the current track back several times
    // instead of answering with an empty list.
    const upcoming = queue.filter((item) => item.id !== trackId).length;
    remoteQueue = { trackId, at: Date.now(), upcoming };
    return upcoming;
  } catch {
    return null;
  }
}

function remember(track: UnifiedTrack): void {
  const previousId = history[history.length - 1]?.id;
  if (previousId === track.id) return;

  history.push(track);
  if (history.length > HISTORY_SIZE) history = history.slice(-HISTORY_SIZE);

  // Left the radio for something else: the label goes with it.
  const { radioTrackIds, setRadio } = useAutoplayStore.getState();
  if (previousId && radioTrackIds.has(previousId) && !radioTrackIds.has(track.id)) {
    setRadio([]);
  }
}

function buildRadio(seed: UnifiedTrack): Promise<SimplifiedTrack[]> {
  const recent = history.slice(-SEED_TRACKS);
  const artistNames = [
    ...new Set([...seed.artists, ...recent.flatMap((track) => track.artists)].map((a) => a.name)),
  ];
  return fetchRelatedTracks(
    { artistNames, excludeTrackIds: [seed.id, ...history.map((track) => track.id)] },
    RADIO_SIZE
  );
}

/** Builds the continuation while the last song still plays, so the gap stays short. */
function prepare(seed: UnifiedTrack): void {
  if (prepared?.seedId === seed.id) return;
  const tracks = buildRadio(seed);
  // Settled here so an unused, failed build is not an unhandled rejection.
  tracks.catch(() => {});
  prepared = { seedId: seed.id, tracks };
}

/** Spotify stopped because the context ran out, not because someone paused. */
function ranOut(prev: Sample, next: Sample | null): boolean {
  if (!prev.isPlaying || prev.upcoming !== 0) return false;
  if (next?.isPlaying) return false;

  const elapsed = (next?.sampledAt ?? Date.now()) - prev.sampledAt;
  const reachedEnd = prev.positionMs + elapsed >= prev.durationMs - END_SLACK_MS;
  if (!next) return reachedEnd;

  // At the end of a context Spotify either parks on the last track or jumps
  // back to the first one, paused.
  const wrapped = next.track.id !== prev.track.id;
  const parkedAtEnd = next.positionMs >= next.durationMs - END_SLACK_MS;
  return reachedEnd || wrapped || parkedAtEnd;
}

async function startRadio(seed: UnifiedTrack): Promise<boolean> {
  if (starting) return false;
  starting = true;
  retry = null;
  const started = performance.now();

  try {
    const pending = prepared?.seedId === seed.id ? prepared.tracks : buildRadio(seed);
    prepared = null;
    const tracks = await pending.catch(() => [] as SimplifiedTrack[]);
    if (tracks.length === 0) throw new Error("no radio tracks found");

    if (!isSpotifyWebPlaybackReady()) await ensureActiveDevice();
    await playTracks(tracks.map((track) => `spotify:track:${track.id}`));
    useAutoplayStore.getState().setRadio(tracks.map((track) => track.id));
    logDiagnostic(
      "autoplay",
      `radio after "${seed.name}" (${tracks.length} tracks) in ${Math.round(performance.now() - started)} ms`
    );
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logDiagnostic("autoplay", `radio failed, retrying: ${detail}`);
    retry = { seed, at: Date.now() + RETRY_MS };
    return false;
  } finally {
    starting = false;
    // The next sample is the radio's first; comparing it with the stopped
    // track would read as another run-out.
    last = null;
  }
}

function handle(sample: Sample | null): void {
  const prev = last;
  last = sample;

  if (sample) remember(sample.track);
  // Something plays again, so whatever failed earlier no longer matters.
  if (sample?.isPlaying) retry = null;

  if (sample?.isPlaying && sample.upcoming === 0) prepare(sample.track);

  if (!starting && prev && ranOut(prev, sample)) {
    void startRadio(prev.track);
    return;
  }

  if (retry && !starting && Date.now() >= retry.at && !sample?.isPlaying) {
    void startRadio(retry.seed);
  }
}

async function tick(): Promise<void> {
  if ((await getActiveProviderType()) !== "spotify") {
    last = null;
    return;
  }
  // The AI DJ steers playback itself; a radio on top would fight it.
  if (useAIQueueStore.getState().isActive) {
    last = null;
    return;
  }

  let sample: Sample | null;
  try {
    sample = await readSample();
  } catch {
    // A failed read says nothing about playback; wait for the next one.
    return;
  }
  handle(sample);
}

/** One tick at a time; a trigger during a tick runs another straight after. */
async function runTick(): Promise<void> {
  if (ticking) {
    tickAgain = true;
    return;
  }
  ticking = true;
  try {
    do {
      tickAgain = false;
      await tick();
    } while (tickAgain);
  } catch (error) {
    console.error("Spotify autoplay tick failed:", error);
  } finally {
    ticking = false;
  }
}

export function startSpotifyAutoplay(): void {
  if (timer) return;
  // One controller per app. The mini player runs its own copy of this module,
  // and two of them would both start a radio when a playlist ends.
  if (getCurrentWindow().label !== "main") return;

  timer = setInterval(() => void runTick(), POLL_MS);
  unsubscribe = subscribeSpotifyLocalPlayback(() => void runTick());
}

export function stopSpotifyAutoplay(): void {
  if (timer) clearInterval(timer);
  timer = null;
  unsubscribe?.();
  unsubscribe = null;
  last = null;
  prepared = null;
  retry = null;
}

/**
 * Next, the way Spotify does it: inside a playlist or radio a normal skip, on
 * the last song of whatever is playing straight into the radio instead of
 * stopping.
 */
export async function skipToNext(): Promise<void> {
  // Before any await: activating the SDK needs the click still on the stack.
  void activateSpotifyWebPlayback().catch(() => {});

  const provider = await getActiveProvider();
  if ((await getActiveProviderType()) === "spotify" && !useAIQueueStore.getState().isActive) {
    const sample = await readSample(true).catch(() => null);
    if (sample?.upcoming === 0 && (await startRadio(sample.track))) return;
  }
  provider.nextTrack();
}
