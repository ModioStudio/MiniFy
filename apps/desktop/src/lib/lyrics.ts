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

const cache = new Map<string, Lyrics | null>();

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

async function getJson<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${ENDPOINT}/${path}?${query}`);
  if (!response.ok) return null;
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

export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationMs: number
): Promise<Lyrics | null> {
  const key = `${artistName}|${trackName}|${durationMs}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let result: Lyrics | null = null;

  try {
    const exact = await getJson<LrclibRecord>("get", {
      artist_name: artistName,
      track_name: trackName,
      album_name: albumName,
      duration: Math.round(durationMs / 1000).toString(),
    });

    if (exact) {
      result = toLyrics(exact);
    } else {
      // The exact endpoint wants all four fields to line up, which they rarely
      // do once a remix or a re-release is involved.
      const found = await getJson<LrclibRecord[]>("search", {
        q: `${artistName} ${trackName}`,
      });
      const match = found ? bestMatch(found, durationMs) : null;
      result = match ? toLyrics(match) : null;
    }
  } catch {
    result = null;
  }

  cache.set(key, result);
  return result;
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
