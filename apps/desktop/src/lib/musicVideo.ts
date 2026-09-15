import { invoke } from "@tauri-apps/api/core";
import type { UnifiedTrack } from "../providers/types";
import { logDiagnostic } from "./diagnostics";

/** One youtube.com search result, as `search_music_videos` returns it. */
export type VideoCandidate = {
  videoId: string;
  title: string;
  channel: string;
  durationS: number | null;
  /** The artist's own channel (YouTube's music-note badge). */
  verifiedArtist: boolean;
  verified: boolean;
};

const CACHE_KEY = "minify.musicVideos";
const CACHE_LIMIT = 400;
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A track without a video may get one; ask again the next day. */
const EMPTY_TTL_MS = 24 * 60 * 60 * 1000;
/** Fallbacks for when a video refuses to be embedded. */
const MAX_CHOICES = 5;
/** Below this a result is more likely a lyric video or a fan upload than the video. */
const MIN_SCORE = 5;

/** Only counted against a result when the track itself is not one. */
const UNWANTED = [
  "lyric",
  "lyrics",
  "audio",
  "visualizer",
  "visualiser",
  "live",
  "cover",
  "karaoke",
  "reaction",
  "remix",
  "sped up",
  "slowed",
  "reverb",
  "8d",
  "nightcore",
  "instrumental",
  "hour",
  "loop",
  "fan made",
  "fanmade",
  "tutorial",
  "lesson",
  "piano",
  "guitar",
  "drum",
  "teaser",
  "trailer",
  "behind the scenes",
  "making of",
  "shorts",
  "amv",
  "tiktok",
  // Portrait cuts made for phones; cropped to 16:9 only their middle is left.
  "vertical",
];

// One word may sit in between: "Official 4K Video", "Official Animated Video".
const OFFICIAL =
  /\b(official( \w+)? (music )?video|music video|official mv|videoclip|video clip)\b/;
const VIDEO_WORD = /[([](hd |4k )?video( hd| 4k)?[)\]]/;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** "Song - Remastered 2011" or "Song (feat. X)" -> "song". */
function baseName(trackName: string): string {
  const main = trackName.split(" - ")[0] ?? trackName;
  return normalize(main.replace(/[([][^)\]]*[)\]]/g, " "));
}

function hasWord(haystack: string, word: string): boolean {
  return ` ${haystack} `.includes(` ${word} `);
}

function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

function score(
  candidate: VideoCandidate,
  index: number,
  trackName: string,
  artistNames: string[],
  durationMs: number
): number {
  const title = normalize(candidate.title);
  const channel = normalize(candidate.channel);
  const trackWords = normalize(trackName);
  const base = baseName(trackName);
  const artists = artistNames.map(normalize).filter(Boolean);
  let points = 0;

  // "Artist - Topic" channels carry the audio over a still of the cover.
  if (channel.endsWith(" topic")) return Number.NEGATIVE_INFINITY;

  points += base && title.includes(base) ? 4 : -6;

  const channelKey = squash(channel.replace(/\b(vevo|official|music|tv)\b/g, ""));
  const artistChannel = artists.some((artist) => {
    const key = squash(artist);
    return key.length > 0 && (channelKey === key || channelKey.startsWith(key));
  });
  const artistInTitle = artists.some((artist) => title.includes(artist));
  if (artistChannel) points += 4;
  if (artistInTitle) points += 2;
  if (!artistChannel && !artistInTitle) points -= 4;

  if (candidate.verifiedArtist) points += 3;
  else if (candidate.verified) points += 1;
  if (channel.endsWith("vevo")) points += 3;

  if (OFFICIAL.test(title)) points += 5;
  else if (VIDEO_WORD.test(title) || hasWord(title, "video")) points += 2;
  else points -= 2;

  for (const word of UNWANTED) {
    if (hasWord(title, word) && !hasWord(trackWords, word)) points -= 8;
  }

  const lengthS = candidate.durationS;
  if (lengthS !== null) {
    if (lengthS < 60) points -= 10;
    if (durationMs > 0) {
      const off = Math.abs(lengthS - durationMs / 1000);
      if (off <= 20) points += 2;
      else if (off > 300) points -= 8;
      else if (off > 90) points -= 3;
    }
  }

  // YouTube's own order is a signal too, just a weak one.
  return points + Math.max(0, 12 - index) * 0.15;
}

/** Best music video first; results that are not one are dropped. */
export function rankMusicVideos(
  candidates: VideoCandidate[],
  trackName: string,
  artistNames: string[],
  durationMs: number
): VideoCandidate[] {
  const seen = new Set<string>();
  return candidates
    .map((candidate, index) => ({
      candidate,
      points: score(candidate, index, trackName, artistNames, durationMs),
    }))
    .filter(({ points }) => points >= MIN_SCORE)
    .sort((a, b) => b.points - a.points)
    .map(({ candidate }) => candidate)
    .filter((candidate) => !seen.has(candidate.videoId) && seen.add(candidate.videoId))
    .slice(0, MAX_CHOICES);
}

type CacheEntry = { at: number; videos: VideoCandidate[] };

function readCache(): Record<string, CacheEntry> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
}

function cached(trackId: string): VideoCandidate[] | null {
  const entry = readCache()[trackId];
  if (!entry || !Array.isArray(entry.videos)) return null;
  const ttl = entry.videos.length > 0 ? FOUND_TTL_MS : EMPTY_TTL_MS;
  return Date.now() - entry.at < ttl ? entry.videos : null;
}

function remember(trackId: string, videos: VideoCandidate[]): void {
  const all = readCache();
  all[trackId] = { at: Date.now(), videos };
  const newest = Object.entries(all)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, CACHE_LIMIT);
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // A full storage only costs a repeat search next time.
  }
}

const pending = new Map<string, Promise<VideoCandidate[]>>();

/**
 * The track's music video and a few fallbacks, best first; empty when YouTube
 * has nothing that passes for one. Kept per track, so a song heard again
 * starts its video straight away.
 */
export function findMusicVideos(track: UnifiedTrack): Promise<VideoCandidate[]> {
  const hit = cached(track.id);
  if (hit) return Promise.resolve(hit);

  const running = pending.get(track.id);
  if (running) return running;

  const artistNames = track.artists.map((artist) => artist.name);
  const query = `${artistNames[0] ?? ""} ${track.name} official music video`.trim();
  const started = performance.now();
  const request = invoke<VideoCandidate[]>("search_music_videos", { query })
    .then((results) => {
      const ranked = rankMusicVideos(results, track.name, artistNames, track.durationMs);
      remember(track.id, ranked);
      logDiagnostic(
        "video",
        `search for "${track.name}": ${ranked.length} usable in ${Math.round(performance.now() - started)} ms`
      );
      return ranked;
    })
    .finally(() => pending.delete(track.id));

  pending.set(track.id, request);
  return request;
}
