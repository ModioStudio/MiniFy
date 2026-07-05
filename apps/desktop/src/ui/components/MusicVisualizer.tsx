import { useEffect, useRef } from "react";
import { readSettings } from "../../lib/settingLib";
import { getActiveProvider, getActiveProviderType } from "../../providers";
import type { MusicProviderType } from "../../providers/types";
import {
  type AudioFeatures,
  fetchAudioAnalysis,
  fetchAudioFeatures,
  getPlayerState,
  type SimplifiedTrack,
  type SpotifyAudioAnalysis,
} from "../spotifyClient";

type Edge = "top" | "bottom" | "left" | "right";

type MusicVisualizerProps = {
  colorMode: string;
  intensity?: number;
};

type PlaybackSignal = {
  provider: MusicProviderType | null;
  trackKey: string | null;
  trackName: string;
  artistText: string;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  syncedAt: number;
};

type VisualBeat = {
  time: number;
  duration: number;
  strength: number;
};

type VisualSection = {
  start: number;
  end: number;
  intensity: number;
  bass: number;
  texture: number;
  tempo: number;
  density: number;
};

type DynamicsProfile = {
  trackKey: string;
  source: "spotify-analysis" | "spotify-features" | "procedural";
  tempo: number;
  energy: number;
  danceability: number;
  acousticness: number;
  bassWeight: number;
  dynamicRange: number;
  softness: number;
  durationSec: number;
  seed: number;
  beats: VisualBeat[];
  sections: VisualSection[];
};

const EDGE_PHASE: Record<Edge, number> = {
  top: 0,
  right: 1.7,
  bottom: 3.3,
  left: 5.1,
};

const SAMPLES = 48;
const DEFAULT_ACCENT: [number, number, number] = [116, 199, 236];

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t);
}

function easeToward(current: number, target: number, attack: number, release: number, dt: number) {
  const speed = target > current ? attack : release;
  return current + (target - current) * Math.min(1, dt * speed);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function smoothNoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(seededUnit(seed, i), seededUnit(seed, i + 1), u);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace("#", "");
  if (clean.length === 3) {
    const r = Number.parseInt(clean[0] + clean[0], 16);
    const g = Number.parseInt(clean[1] + clean[1], 16);
    const b = Number.parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length >= 6) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
  }
  return DEFAULT_ACCENT;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function createSectionsFromPattern(
  durationSec: number,
  tempo: number,
  energy: number,
  danceability: number,
  acousticness: number,
  bassWeight: number,
  seed: number
): VisualSection[] {
  const acousticPull = acousticness * 0.2;
  const hookLift = 0.34 + energy * 0.42 + danceability * 0.2;
  const intro = 0.1 + seededUnit(seed, 1) * 0.1;
  const build = intro + 0.12 + seededUnit(seed, 2) * 0.1;
  const hook = build + 0.16 + seededUnit(seed, 3) * 0.11;
  const breakPoint = hook + 0.12 + seededUnit(seed, 4) * 0.12;
  const finalHook = breakPoint + 0.12 + seededUnit(seed, 5) * 0.12;
  const points = [
    { start: 0, end: intro, lift: 0.25, bass: 0.22, texture: 0.26 },
    { start: intro, end: build, lift: 0.48, bass: 0.45, texture: 0.5 },
    { start: build, end: hook, lift: hookLift, bass: 0.92, texture: 0.9 },
    { start: hook, end: breakPoint, lift: 0.33, bass: 0.22, texture: 0.36 },
    { start: breakPoint, end: finalHook, lift: hookLift * 0.86, bass: 0.72, texture: 0.76 },
    { start: finalHook, end: 1, lift: hookLift * 1.08, bass: 1, texture: 0.92 },
  ];

  return points
    .filter((point) => point.end > point.start)
    .map((point, index) => {
      const sectionTempo = tempo * (0.96 + seededUnit(seed, index + 10) * 0.08);
      return {
        start: point.start * durationSec,
        end: point.end * durationSec,
        intensity: clamp(point.lift + energy * 0.28 - acousticPull, 0.12, 1),
        bass: clamp(point.bass * bassWeight * (1 - acousticness * 0.25), 0.06, 1),
        texture: clamp(point.texture * (0.35 + energy * 0.45 + danceability * 0.25), 0.08, 1),
        tempo: sectionTempo,
        density: clamp(0.18 + danceability * 0.5 + energy * 0.32 - acousticness * 0.12, 0.08, 1),
      };
    });
}

function createProceduralProfile(
  trackKey: string,
  trackName: string,
  artistText: string,
  durationMs: number
): DynamicsProfile {
  const seed = hashString(`${trackKey}:${trackName}:${artistText}`);
  const durationSec = Math.max(60, durationMs > 0 ? durationMs / 1000 : 210);
  const tempo = clamp(84 + seededUnit(seed, 20) * 58, 72, 150);
  const energy = clamp(0.44 + seededUnit(seed, 21) * 0.28);
  const danceability = clamp(0.38 + seededUnit(seed, 22) * 0.34);
  const acousticness = clamp(0.2 + seededUnit(seed, 23) * 0.28);
  const bassWeight = clamp(0.28 + energy * 0.4 + danceability * 0.22 - acousticness * 0.16);
  const dynamicRange = clamp(0.42 + seededUnit(seed, 24) * 0.32);
  const sections = createSectionsFromPattern(
    durationSec,
    tempo,
    energy,
    danceability,
    acousticness,
    bassWeight,
    seed
  );

  return {
    trackKey,
    source: "procedural",
    tempo,
    energy,
    danceability,
    acousticness,
    bassWeight,
    dynamicRange,
    softness: clamp(acousticness * 0.82 + (1 - energy) * 0.28 - danceability * 0.16),
    durationSec,
    seed,
    beats: [],
    sections,
  };
}

function buildSpotifyProfile(
  track: SimplifiedTrack,
  features: AudioFeatures | null,
  analysis: SpotifyAudioAnalysis | null,
  fallback: DynamicsProfile
): DynamicsProfile {
  const durationSec = Math.max(60, (track.duration_ms || 0) / 1000, analysis?.track.duration ?? 0);
  const tempo = clamp(analysis?.track.tempo ?? features?.tempo ?? fallback.tempo, 55, 190);
  const energy = clamp(features?.energy ?? fallback.energy);
  const danceability = clamp(features?.danceability ?? fallback.danceability);
  const acousticness = clamp(features?.acousticness ?? fallback.acousticness);
  const loudness = analysis?.sections.map((section) => section.loudness) ?? [];
  const minLoudness = loudness.length > 0 ? Math.min(...loudness) : -24;
  const maxLoudness = loudness.length > 0 ? Math.max(...loudness) : -6;
  const loudnessRange = Math.max(1, maxLoudness - minLoudness);
  const dynamicRange = clamp(loudnessRange / 18 + (1 - acousticness) * 0.18, 0.14, 1);
  const bassWeight = clamp(
    energy * 0.5 + danceability * 0.34 + (1 - acousticness) * 0.24 + dynamicRange * 0.12,
    0.04,
    1
  );

  const sections =
    analysis?.sections && analysis.sections.length > 0
      ? analysis.sections.map((section) => {
          const loudnessLift = clamp((section.loudness - minLoudness) / loudnessRange);
          const tempoConfidence = clamp(section.tempo_confidence);
          const intensity = clamp(
            0.12 +
              loudnessLift * 0.48 +
              energy * 0.32 +
              danceability * 0.12 +
              tempoConfidence * 0.1 -
              acousticness * 0.2,
            0.06,
            1
          );
          return {
            start: section.start,
            end: Math.min(durationSec, section.start + section.duration),
            intensity,
            bass: clamp(
              bassWeight * (0.42 + loudnessLift * 0.78) * (0.86 + tempoConfidence * 0.18)
            ),
            texture: clamp(
              0.12 + loudnessLift * 0.32 + dynamicRange * 0.26 + (1 - acousticness) * 0.22,
              0.08,
              1
            ),
            tempo: clamp(section.tempo || tempo, 55, 190),
            density: clamp(
              0.12 + danceability * 0.48 + tempoConfidence * 0.24 + loudnessLift * 0.18,
              0.08,
              1
            ),
          };
        })
      : createSectionsFromPattern(
          durationSec,
          tempo,
          energy,
          danceability,
          acousticness,
          bassWeight,
          fallback.seed
        );

  const beats =
    analysis?.beats
      ?.filter((beat) => beat.confidence > 0.04)
      .slice(0, 1400)
      .map((beat) => ({
        time: beat.start,
        duration: Math.max(0.18, beat.duration),
        strength: clamp(0.3 + beat.confidence * 0.7),
      })) ?? [];

  return {
    trackKey: `spotify:${track.id}`,
    source: analysis ? "spotify-analysis" : "spotify-features",
    tempo,
    energy,
    danceability,
    acousticness,
    bassWeight,
    dynamicRange,
    softness: clamp(acousticness * 0.85 + (1 - energy) * 0.3 - danceability * 0.14),
    durationSec,
    seed: fallback.seed,
    beats,
    sections,
  };
}

async function loadSpotifyDynamics(track: SimplifiedTrack): Promise<DynamicsProfile> {
  const artistText = track.artists.map((artist) => artist.name).join(", ");
  const fallback = createProceduralProfile(
    `spotify:${track.id}`,
    track.name,
    artistText,
    track.duration_ms
  );
  const [featuresResult, analysisResult] = await Promise.allSettled([
    fetchAudioFeatures([track.id]),
    fetchAudioAnalysis(track.id),
  ]);
  const features = featuresResult.status === "fulfilled" ? (featuresResult.value[0] ?? null) : null;
  const analysis = analysisResult.status === "fulfilled" ? analysisResult.value : null;
  if (!features && !analysis) return fallback;
  return buildSpotifyProfile(track, features, analysis, fallback);
}

function sectionAt(profile: DynamicsProfile, index: number): VisualSection {
  return (
    profile.sections[index] ?? {
      start: 0,
      end: Math.max(1, profile.durationSec),
      intensity: profile.energy,
      bass: profile.bassWeight,
      texture: profile.dynamicRange,
      tempo: profile.tempo,
      density: profile.danceability,
    }
  );
}

type Moment = {
  section: VisualSection;
  lift: number;
  bassBoost: number;
  textureBoost: number;
  shimmer: number;
  fill: boolean;
  fillRamp: number;
  barIndex: number;
  endFade: number;
};

function getMoment(profile: DynamicsProfile, seconds: number): Moment {
  const duration = Math.max(1, profile.durationSec);
  const position = clamp(seconds, 0, duration - 0.001);
  const index = profile.sections.findIndex((item) => position >= item.start && position < item.end);
  const current = sectionAt(profile, index);
  const previous = index > 0 ? sectionAt(profile, index - 1) : current;
  const fade = clamp((position - current.start) / 1.6);
  const mix = (a: number, b: number) => lerp(a, b, fade);

  // Songs wind down at the end; taper everything over the last ~14 seconds.
  const endLinear = clamp((duration - position) / 14);
  const endFade = endLinear * endLinear * (3 - 2 * endLinear);

  // Continuous drift keeps the intensity off fixed plateaus between sections.
  const macro = smoothNoise(profile.seed, position * 0.07) - 0.5;
  const wobble = smoothNoise(profile.seed + 11, position * 0.31) - 0.5;

  const tempo = mix(previous.tempo, current.tempo);
  const section: VisualSection = {
    start: current.start,
    end: current.end,
    intensity: clamp(
      mix(previous.intensity, current.intensity) *
        (1 + macro * 0.34 + wobble * 0.18) *
        lerp(0.12, 1, endFade),
      0.02,
      1
    ),
    bass: clamp(
      mix(previous.bass, current.bass) * (1 + macro * 0.4) * lerp(0.1, 1, endFade),
      0.02,
      1
    ),
    texture: clamp(
      mix(previous.texture, current.texture) * (1 + wobble * 0.5) * lerp(0.15, 1, endFade),
      0.02,
      1
    ),
    tempo,
    density: clamp(mix(previous.density, current.density) + macro * 0.15, 0.05, 1),
  };

  // One seeded event per eight-bar phrase, scaled to the song's character.
  const beatDuration = 60 / Math.max(55, tempo);
  const barDuration = beatDuration * 4;
  const phraseDuration = barDuration * 8;
  const phraseIndex = Math.floor(position / phraseDuration);
  const phrasePos = (position - phraseIndex * phraseDuration) / phraseDuration;
  const roll = seededUnit(profile.seed, 900 + phraseIndex);
  const weight = clamp(
    0.5 + profile.energy * 0.4 + profile.danceability * 0.25 - profile.softness * 0.3,
    0.2,
    1.1
  );

  let lift = 0;
  let bassBoost = 0;
  let textureBoost = 0;
  let shimmer = 0;
  let fill = false;
  let fillRamp = 0;

  if (roll < 0.22) {
    // steady phrase, the groove carries it
  } else if (roll < 0.42) {
    // riser: the last bar swells and fills into the next phrase
    if (phrasePos > 0.875) {
      fillRamp = (phrasePos - 0.875) / 0.125;
      fill = true;
      lift = fillRamp * 0.3 * weight;
      textureBoost = fillRamp * 0.55 * weight;
      shimmer = fillRamp * 0.5;
    }
  } else if (roll < 0.6) {
    // drop: the phrase opens with an impact that bleeds off
    const impact = Math.exp(-phrasePos * 9) * weight;
    bassBoost = impact * 0.9;
    lift = impact * 0.35;
  } else if (roll < 0.76) {
    // dip: the first half sits back before returning
    const depth = Math.sin(clamp(phrasePos / 0.6) * Math.PI) * 0.3;
    lift = -depth * (0.5 + profile.softness * 0.5);
    textureBoost = -depth * 0.4;
  } else if (roll < 0.9) {
    // shimmer: texture breathes through the phrase
    const breathe = Math.sin(phrasePos * Math.PI * 3);
    textureBoost = breathe * 0.3 * weight;
    shimmer = clamp(breathe) * 0.6 * weight;
  } else {
    // surge: intensity climbs across the whole phrase
    lift = phrasePos * 0.28 * weight;
    bassBoost = phrasePos * 0.2 * weight;
    if (phrasePos > 0.9) {
      fill = true;
      fillRamp = (phrasePos - 0.9) / 0.1;
    }
  }

  // No risers, drops, or fills into a fading outro.
  if (endFade < 0.6) {
    lift = Math.min(0, lift) * endFade;
    bassBoost *= endFade;
    textureBoost = Math.min(0, textureBoost) * endFade;
    shimmer *= endFade;
    fill = false;
    fillRamp = 0;
  }

  return {
    section,
    lift,
    bassBoost,
    textureBoost,
    shimmer: clamp(shimmer),
    fill,
    fillRamp,
    barIndex: Math.floor(position / barDuration),
    endFade,
  };
}

function findBeatIndex(beats: VisualBeat[], seconds: number): number {
  let low = 0;
  let high = beats.length - 1;
  let best = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (beats[mid].time <= seconds) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function getBeatPulse(profile: DynamicsProfile, seconds: number, moment: Moment) {
  const section = moment.section;
  const beatDuration = 60 / Math.max(55, section.tempo || profile.tempo);
  const duration = Math.max(1, profile.durationSec);
  const position = clamp(seconds, 0, duration - 0.001);
  const endTaper = 0.12 + 0.88 * moment.endFade;

  if (profile.beats.length > 0) {
    const index = findBeatIndex(profile.beats, position);
    const beat = index >= 0 ? profile.beats[index] : null;
    const age = beat ? position - beat.time : beatDuration;
    const effectiveDuration = beat?.duration ?? beatDuration;
    const decay = lerp(5.5, 15, profile.bassWeight);
    const accent = 0.75 + seededUnit(profile.seed, 300 + (index % 16)) * 0.5;
    const kick =
      beat && age >= 0 && age < effectiveDuration * 1.35
        ? Math.exp(-age * decay) * beat.strength * accent
        : 0;
    const offAge = age - effectiveDuration * 0.5;
    const off =
      offAge >= 0 && offAge < effectiveDuration * 0.65
        ? Math.exp(-offAge * 10) * profile.danceability * 0.42
        : 0;
    return {
      kick: clamp((kick + off) * endTaper),
      phase: clamp(age / Math.max(0.12, effectiveDuration)),
      duration: effectiveDuration,
    };
  }

  const beatIndex = Math.floor(position / beatDuration);
  const beatInBar = beatIndex % 4;
  const phase = (position / beatDuration) % 1;

  // Downbeat and backbeat lead; a seeded 16-beat accent cycle keeps hits uneven.
  let strength = beatInBar === 0 ? 1 : beatInBar === 2 ? 0.82 : 0.6;
  strength *= 0.72 + seededUnit(profile.seed, 300 + (beatIndex % 16)) * 0.48;
  if (beatInBar !== 0 && seededUnit(profile.seed, 500 + (beatIndex % 32)) < 0.1) {
    strength *= 0.3;
  }

  const decay = lerp(6, 14, profile.bassWeight);
  let kick = Math.exp(-phase * decay) * strength;

  // Off-beat response scaled by danceability, varying per bar.
  const offWeight =
    profile.danceability *
    (0.15 + seededUnit(profile.seed, 700 + (Math.floor(beatIndex / 4) % 8)) * 0.3);
  kick += Math.exp(-((phase + 0.5) % 1) * 10) * offWeight;

  // Fills subdivide into eighth notes and ramp into the next phrase.
  if (moment.fill) {
    const subPhase = (position / (beatDuration / 2)) % 1;
    kick = Math.max(kick, Math.exp(-subPhase * decay * 1.4) * (0.45 + moment.fillRamp * 0.65));
  }

  return {
    kick: clamp(kick * (0.4 + section.bass * 0.7) * endTaper),
    phase,
    duration: beatDuration,
  };
}

function estimateProgressSeconds(playback: PlaybackSignal, now: number): number {
  let progress = playback.progressMs;
  if (playback.isPlaying) {
    progress += now - playback.syncedAt;
  }
  // Hold at the end instead of wrapping: extrapolating past the track's end
  // must not restart the effect while nothing plays; the next poll resyncs.
  if (playback.durationMs > 0) {
    progress = Math.min(progress, playback.durationMs);
  }
  return Math.max(0, progress / 1000);
}

const idleProfile = createProceduralProfile("idle", "", "", 180000);

export default function MusicVisualizer({ colorMode, intensity = 100 }: MusicVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackRef = useRef<PlaybackSignal>({
    provider: null,
    trackKey: null,
    trackName: "",
    artistText: "",
    isPlaying: false,
    progressMs: 0,
    durationMs: 0,
    syncedAt: performance.now(),
  });
  const volumeRef = useRef<number>(0.6);
  const profileRef = useRef<DynamicsProfile>(idleProfile);
  const profileRequestRef = useRef<number>(0);

  const colorModeRef = useRef<string>(colorMode);
  const accentRef = useRef<[number, number, number]>(DEFAULT_ACCENT);
  const fixedRef = useRef<[number, number, number]>(DEFAULT_ACCENT);
  const intensityRef = useRef<number>(intensity);

  useEffect(() => {
    colorModeRef.current = colorMode;
    if (colorMode !== "theme" && colorMode !== "random") {
      fixedRef.current = hexToRgb(colorMode);
    }
  }, [colorMode]);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  useEffect(() => {
    let cancelled = false;

    const applyProceduralTrack = (
      provider: MusicProviderType,
      trackKey: string,
      trackName: string,
      artistText: string,
      durationMs: number
    ) => {
      if (profileRef.current.trackKey !== trackKey) {
        profileRequestRef.current++;
        profileRef.current = createProceduralProfile(trackKey, trackName, artistText, durationMs);
      }
      playbackRef.current = {
        ...playbackRef.current,
        provider,
        trackKey,
        trackName,
        artistText,
        durationMs,
        syncedAt: performance.now(),
      };
    };

    const poll = async () => {
      try {
        const type = await getActiveProviderType();

        if (type === "spotify") {
          const state = await getPlayerState();
          if (cancelled) return;

          if (!state?.item) {
            playbackRef.current = {
              ...playbackRef.current,
              provider: "spotify",
              isPlaying: false,
              progressMs: 0,
              syncedAt: performance.now(),
            };
            return;
          }

          const track = state.item;
          const artistText = track.artists.map((artist) => artist.name).join(", ");
          const trackKey = `spotify:${track.id}`;
          const currentKey = playbackRef.current.trackKey;

          playbackRef.current = {
            provider: "spotify",
            trackKey,
            trackName: track.name,
            artistText,
            isPlaying: state.is_playing,
            progressMs: state.progress_ms ?? playbackRef.current.progressMs,
            durationMs: track.duration_ms,
            syncedAt: performance.now(),
          };
          if (state.device) {
            volumeRef.current = clamp(state.device.volume_percent / 100);
          }

          if (trackKey !== currentKey) {
            profileRef.current = createProceduralProfile(
              trackKey,
              track.name,
              artistText,
              track.duration_ms
            );
            const requestId = profileRequestRef.current + 1;
            profileRequestRef.current = requestId;
            loadSpotifyDynamics(track)
              .then((profile) => {
                if (!cancelled && profileRequestRef.current === requestId) {
                  profileRef.current = profile;
                }
              })
              .catch(() => {
                // The procedural profile is already active.
              });
          }
        } else {
          const provider = await getActiveProvider();
          const playback = await provider.getPlaybackState();
          if (cancelled) return;

          const settings = await readSettings();
          if (cancelled) return;
          volumeRef.current = clamp((settings.youtube_volume ?? 50) / 100);

          if (!playback?.track) {
            playbackRef.current = {
              ...playbackRef.current,
              provider: "youtube",
              isPlaying: false,
              progressMs: 0,
              syncedAt: performance.now(),
            };
            return;
          }

          const artistText = playback.track.artists.map((artist) => artist.name).join(", ");
          const trackKey = `youtube:${playback.track.id}`;
          applyProceduralTrack(
            "youtube",
            trackKey,
            playback.track.name,
            artistText,
            playback.track.durationMs
          );
          playbackRef.current = {
            ...playbackRef.current,
            isPlaying: playback.isPlaying,
            progressMs: playback.progressMs ?? playbackRef.current.progressMs,
          };
        }
      } catch {
        // Ignore transient API/network errors; keep the last known motion state.
      }
    };

    void poll();
    const id = setInterval(poll, 650);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const readColor = () => {
      const scope = document.querySelector(".theme-scope") ?? document.documentElement;
      const raw = getComputedStyle(scope as Element)
        .getPropertyValue("--settings-accent")
        .trim();
      if (raw) accentRef.current = hexToRgb(raw);
    };
    readColor();
    const id = setInterval(readColor, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let level = 0;
    let bassLevel = 0;
    let textureLevel = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const resolveColor = (t: number): [number, number, number] => {
      const mode = colorModeRef.current;
      if (mode === "random") return hslToRgb(t * 14, 0.85, 0.62);
      if (mode === "theme") return accentRef.current;
      return fixedRef.current;
    };

    const waveNorm = (
      p: number,
      t: number,
      edge: Edge,
      profile: DynamicsProfile,
      moment: Moment,
      beatPhase: number,
      seconds: number
    ): number => {
      const section = moment.section;
      const phase = EDGE_PHASE[edge] + (profile.seed % 1000) * 0.002;
      const tempoFactor = clamp(section.tempo / 129, 0.65, 1.45);
      const movement = 0.82 + section.density * 0.38;
      // Harmonic weights drift with the song position so the shape keeps evolving.
      const w1 = 0.36 + smoothNoise(profile.seed + 41, seconds * 0.18 + EDGE_PHASE[edge]) * 0.28;
      const w2 = 0.18 + smoothNoise(profile.seed + 42, seconds * 0.13 + EDGE_PHASE[edge]) * 0.24;
      const w3 = 0.1 + textureLevel * 0.18;
      const wShimmer = moment.shimmer * 0.24;
      let s = 0;
      s +=
        Math.sin(
          p * Math.PI * 2 * (3 + textureLevel * 0.8) + t * 2.6 * tempoFactor * movement + phase
        ) * w1;
      s +=
        Math.sin(
          p * Math.PI * 2 * (7 + section.texture * 1.6) -
            t * 3.7 * tempoFactor * movement +
            phase * 1.3
        ) * w2;
      s +=
        Math.sin(
          p * Math.PI * 2 * (13 + profile.dynamicRange * 2.2) +
            t * 5.0 * tempoFactor * (0.8 + textureLevel * 0.55)
        ) * w3;
      if (wShimmer > 0.004) {
        s += Math.sin(p * Math.PI * 2 * 21 - t * 7.5 * tempoFactor + phase * 1.7) * wShimmer;
      }
      s /= w1 + w2 + w3 + wShimmer;
      // The bass lobe travels along the edge, flipping direction per bar.
      const dir = seededUnit(profile.seed, 800 + (moment.barIndex % 16)) < 0.5 ? 1 : -1;
      const travellingBass = Math.sin(
        p * Math.PI * 2 * (1.8 + profile.danceability * 2.4) -
          dir * beatPhase * Math.PI * 2 +
          phase * 0.9
      );
      const bassLobe = clamp((travellingBass + 1) / 2) ** 3 * bassLevel * profile.bassWeight;
      return clamp((s + 1) / 2 + bassLobe * 0.45);
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      const playback = playbackRef.current;
      const profile = profileRef.current;
      const seconds = estimateProgressSeconds(playback, now);
      const moment = getMoment(profile, seconds);
      const section = moment.section;
      const beat = getBeatPulse(profile, seconds, moment);
      const volume = clamp(volumeRef.current);
      const playing = playback.isPlaying ? 1 : 0;

      const targetLevel =
        playing *
        clamp(
          0.16 +
            volume * 0.38 +
            (section.intensity + moment.lift) * 0.62 +
            beat.kick * 0.18 -
            profile.acousticness * 0.06,
          0,
          1
        );
      const targetBass =
        playing *
        clamp(
          (beat.kick * 1.65 + section.bass * 0.28 + moment.bassBoost) *
            section.bass *
            (0.66 + volume * 0.82) *
            (0.6 + profile.bassWeight * 0.9),
          0,
          1
        );
      const targetTexture =
        playing *
        clamp(
          (section.texture * 0.34 +
            beat.kick * section.density * 0.66 +
            moment.textureBoost * 0.5) *
            (0.3 + profile.dynamicRange * 0.82),
          0,
          1
        );

      // Fast attack so transients land the frame they happen; releases stay musical.
      level = easeToward(level, targetLevel, 20, 4.2, dt);
      bassLevel = Math.max(targetBass, bassLevel * Math.exp(-dt * lerp(5, 9, profile.bassWeight)));
      textureLevel = Math.max(targetTexture, textureLevel * Math.exp(-dt * 7));

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      if (level > 0.006) {
        // 100 keeps the stock look; below shrinks the effect, above pushes it.
        const gain = clamp(intensityRef.current / 100, 0.2, 2);
        const minSide = Math.min(w, h);
        const punch = 0.55 + bassLevel * 2.45 + textureLevel * 0.28;
        const maxDepth = Math.min(
          minSide * 0.52,
          minSide *
            0.34 *
            clamp(level * (0.72 + section.intensity * 0.5) + bassLevel * 0.72, 0.05, 1.55) *
            punch *
            gain
        );
        const [r, g, b] = resolveColor(t);
        const edgeAlpha = Math.min(
          Math.min(0.78, 0.72 * (0.75 + 0.25 * gain)),
          0.55 * level * (0.7 + 0.75 * bassLevel) * (0.75 + 0.25 * gain)
        );

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.7 * level})`;
        ctx.shadowBlur = (18 + 34 * bassLevel) * level;

        // Waves ease off toward the corners so adjacent edges meet in a low,
        // calm glow instead of stacking to a bright blob under "lighter".
        const cornerEase = (p: number) => {
          const s = clamp(Math.min(p, 1 - p) / 0.22);
          return 0.25 + 0.75 * s * s * (3 - 2 * s);
        };

        const depthAt = (p: number, edge: Edge) => {
          const sectionWave = waveNorm(p, t, edge, profile, moment, beat.phase, seconds);
          return (0.12 + 0.88 * sectionWave) * maxDepth * cornerEase(p);
        };

        const grad = (x0: number, y0: number, x1: number, y1: number) => {
          const gr = ctx.createLinearGradient(x0, y0, x1, y1);
          gr.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${edgeAlpha})`);
          gr.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${edgeAlpha * 0.34})`);
          gr.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          return gr;
        };

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        for (let i = SAMPLES; i >= 0; i--) {
          const p = i / SAMPLES;
          ctx.lineTo(p * w, depthAt(p, "top"));
        }
        ctx.closePath();
        ctx.fillStyle = grad(0, 0, 0, maxDepth);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(w, h);
        for (let i = SAMPLES; i >= 0; i--) {
          const p = i / SAMPLES;
          ctx.lineTo(p * w, h - depthAt(p, "bottom"));
        }
        ctx.closePath();
        ctx.fillStyle = grad(0, h, 0, h - maxDepth);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, h);
        for (let i = SAMPLES; i >= 0; i--) {
          const p = i / SAMPLES;
          ctx.lineTo(depthAt(p, "left"), p * h);
        }
        ctx.closePath();
        ctx.fillStyle = grad(0, 0, maxDepth, 0);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(w, 0);
        ctx.lineTo(w, h);
        for (let i = SAMPLES; i >= 0; i--) {
          const p = i / SAMPLES;
          ctx.lineTo(w - depthAt(p, "right"), p * h);
        }
        ctx.closePath();
        ctx.fillStyle = grad(w, 0, w - maxDepth, 0);
        ctx.fill();

        // Rounded blooms grow out of each corner, breathing with the ends of
        // their neighbouring edges so the frame reads as one continuous ring.
        const cornerSpecs: {
          x: number;
          y: number;
          edgeA: Edge;
          pA: number;
          edgeB: Edge;
          pB: number;
        }[] = [
          { x: 0, y: 0, edgeA: "top", pA: 0, edgeB: "left", pB: 0 },
          { x: w, y: 0, edgeA: "top", pA: 1, edgeB: "right", pB: 0 },
          { x: w, y: h, edgeA: "bottom", pA: 1, edgeB: "right", pB: 1 },
          { x: 0, y: h, edgeA: "bottom", pA: 0, edgeB: "left", pB: 1 },
        ];
        for (const corner of cornerSpecs) {
          const wave =
            (waveNorm(corner.pA, t, corner.edgeA, profile, moment, beat.phase, seconds) +
              waveNorm(corner.pB, t, corner.edgeB, profile, moment, beat.phase, seconds)) /
            2;
          const radius = Math.max(10, (0.45 + 0.65 * wave) * maxDepth * 1.2);
          const bloom = ctx.createRadialGradient(corner.x, corner.y, 0, corner.x, corner.y, radius);
          bloom.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${edgeAlpha * 0.85})`);
          bloom.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${edgeAlpha * 0.32})`);
          bloom.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.fillStyle = bloom;
          ctx.fillRect(
            corner.x === 0 ? 0 : w - radius,
            corner.y === 0 ? 0 : h - radius,
            radius,
            radius
          );
        }

        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-40"
      style={{ borderRadius: "12px" }}
    />
  );
}
