/**
 * Lyrics come from LRCLIB, a free community database with an open CORS policy
 * and no key. Spotify's own lyrics are licensed from Musixmatch and are not in
 * the Web API, so there is nothing first-party to read them from.
 *
 * Only the track title, artist, album and duration leave the app.
 */

export type LyricLine = {
  /** Milliseconds into the track. */
  timeMs: number;
  text: string;
};

export type Lyrics = {
  /** Present when LRCLIB has a timed transcript. */
  lines: LyricLine[] | null;
  plain: string | null;
  instrumental: boolean;
};

type LrclibRecord = {
  trackName: string;
  artistName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

const ENDPOINT = "https://lrclib.net/api";
const DURATION_TOLERANCE_S = 8;
/** `/get` falls back to external sources on a miss, which can hang. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Waits between attempts when LRCLIB fails rather than answers. */
const RETRY_DELAYS_MS = [1500, 4000, 8000];
const MAX_RETRY_AFTER_MS = 15_000;

/** Only real answers: a track with lyrics, or a definite "none". */
const cache = new Map<string, Lyrics | null>();
const inflight = new Map<string, Promise<Lyrics | null>>();

/**
 * LRCLIB failed instead of answering: overloaded (it sheds load with 503s,
 * sometimes for minutes), rate limited, timed out or unreachable. Not the same
 * as "this track has no lyrics", and never cached as such.
 */
export class LyricsServiceError extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "LyricsServiceError";
    this.retryAfterMs = retryAfterMs;
  }
}

function parseSynced(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const raw of lrc.split("\n")) {
    // A line can carry several timestamps: "[00:12.00][01:04.00] chorus".
    const stamps = [...raw.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)];
    if (stamps.length === 0) continue;

    const text = raw.replace(/\[[^\]]*\]/g, "").trim();

    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
      lines.push({ timeMs: Math.round((minutes * 60 + seconds + fraction) * 1000), text });
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function toLyrics(record: LrclibRecord): Lyrics | null {
  if (record.instrumental) {
    return { lines: null, plain: null, instrumental: true };
  }
  if (!record.syncedLyrics && !record.plainLyrics) return null;

  return {
    lines: record.syncedLyrics ? parseSynced(record.syncedLyrics) : null,
    plain: record.plainLyrics,
    instrumental: false,
  };
}

function retryAfterMs(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** `null` for LRCLIB's 404 "no such track"; throws when the service fails. */
async function getJson<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const query = new URLSearchParams(params).toString();

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${path}?${query}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new LyricsServiceError(error instanceof Error ? error.message : String(error));
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new LyricsServiceError(`LRCLIB answered ${response.status}`, retryAfterMs(response));
  }
  return (await response.json()) as T;
}

/** Picks the candidate whose runtime is closest to the track actually playing. */
function bestMatch(records: LrclibRecord[], durationMs: number): LrclibRecord | null {
  const withLyrics = records.filter((record) => record.syncedLyrics || record.plainLyrics);
  if (withLyrics.length === 0) return null;
  if (durationMs <= 0) return withLyrics[0] ?? null;

  const targetS = durationMs / 1000;
  const ranked = [...withLyrics].sort((a, b) => {
    const da = Math.abs((a.duration ?? 0) - targetS);
    const db = Math.abs((b.duration ?? 0) - targetS);
    // Timed lyrics win over plain ones at a comparable distance.
    if (Math.abs(da - db) < 1) return Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics);
    return da - db;
  });

  const closest = ranked[0];
  if (!closest) return null;
  const distance = Math.abs((closest.duration ?? 0) - targetS);
  return distance <= DURATION_TOLERANCE_S ? closest : null;
}

async function lookup(
  trackName: string,
  artistName: string,
  albumName: string,
  durationMs: number
): Promise<Lyrics | null> {
  const exact = await getJson<LrclibRecord>("get", {
    artist_name: artistName,
    track_name: trackName,
    album_name: albumName,
    duration: Math.round(durationMs / 1000).toString(),
  });
  if (exact) return toLyrics(exact);

  // The exact endpoint wants all four fields to line up, which they rarely
  // do once a remix or a re-release is involved.
  const found = await getJson<LrclibRecord[]>("search", {
    q: `${artistName} ${trackName}`,
  });
  const match = found ? bestMatch(found, durationMs) : null;
  return match ? toLyrics(match) : null;
}

/**
 * Lyrics for a track, or `null` when LRCLIB has none. Retries a few times
 * when LRCLIB fails, then throws `LyricsServiceError` so the caller can try
 * again later instead of showing "no lyrics" for a track that has them.
 */
export function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationMs: number
): Promise<Lyrics | null> {
  const key = `${artistName}|${trackName}|${durationMs}`;
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  // The panel restarts its lookup whenever the track object is re-sent;
  // share the request that is already out instead of firing another.
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await lookup(trackName, artistName, albumName, durationMs);
        cache.set(key, result);
        return result;
      } catch (error) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (!(error instanceof LyricsServiceError) || delay === undefined) throw error;
        const wait = Math.min(MAX_RETRY_AFTER_MS, error.retryAfterMs ?? delay);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  })().finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

/** Index of the line that should be highlighted at `progressMs`, or -1. */
export function activeLineIndex(lines: LyricLine[], progressMs: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.timeMs > progressMs) break;
    index = i;
  }
  return index;
}
