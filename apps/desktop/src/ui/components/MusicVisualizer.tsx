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
            bass: clamp(bassWeight * (0.42 + loudnessLift * 0.78) * (0.86 + tempoConfidence * 0.18)),
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
  const fallback = createProceduralProfile(`spotify:${track.id}`, track.name, artistText, track.duration_ms);
  const [featuresResult, analysisResult] = await Promise.allSettled([
    fetchAudioFeatures([track.id]),
    fetchAudioAnalysis(track.id),
  ]);
  const features =
    featuresResult.status === "fulfilled" ? (featuresResult.value[0] ?? null) : null;
  const analysis = analysisResult.status === "fulfilled" ? analysisResult.value : null;
  if (!features && !analysis) return fallback;
  return buildSpotifyProfile(track, features, analysis, fallback);
}

function getSection(profile: DynamicsProfile, seconds: number): VisualSection {
  const duration = Math.max(1, profile.durationSec);
  const position = ((seconds % duration) + duration) % duration;
  const section = profile.sections.find((item) => position >= item.start && position < item.end);
  return (
    section ?? {
      start: 0,
      end: duration,
      intensity: profile.energy,
      bass: profile.bassWeight,
      texture: profile.dynamicRange,
      tempo: profile.tempo,
      density: profile.danceability,
    }
  );
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

function getBeatPulse(profile: DynamicsProfile, seconds: number, section: VisualSection) {
  const beatDuration = 60 / Math.max(55, section.tempo || profile.tempo);
  if (profile.beats.length > 0) {
    const duration = Math.max(1, profile.durationSec);
    const position = ((seconds % duration) + duration) % duration;
    const index = findBeatIndex(profile.beats, position);
    const beat = index >= 0 ? profile.beats[index] : null;
    const age = beat ? position - beat.time : beatDuration;
    const effectiveDuration = beat?.duration ?? beatDuration;
    const decay = lerp(5.5, 15, profile.bassWeight);
    const kick =
      beat && age >= 0 && age < effectiveDuration * 1.35
        ? Math.exp(-age * decay) * beat.strength
        : 0;
    const offAge = age - effectiveDuration * 0.5;
    const off =
      offAge >= 0 && offAge < effectiveDuration * 0.65
        ? Math.exp(-offAge * 10) * profile.danceability * 0.42
        : 0;
    return {
      kick: clamp(kick + off),
      phase: clamp(age / Math.max(0.12, effectiveDuration)),
      duration: effectiveDuration,
    };
  }

  const phase = (seconds / beatDuration) % 1;
  const transient = Math.exp(-phase * lerp(5.5, 13, profile.bassWeight));
  const offPhase = (phase + 0.5) % 1;
  const off = Math.exp(-offPhase * 9) * profile.danceability * 0.25;
  return {
    kick: clamp((transient + off) * (0.38 + section.bass * 0.72)),
    phase,
    duration: beatDuration,
  };
}

function estimateProgressSeconds(playback: PlaybackSignal, now: number): number {
  let progress = playback.progressMs;
  if (playback.isPlaying) {
    progress += now - playback.syncedAt;
  }
  if (playback.durationMs > 0) {
    progress %= playback.durationMs;
  }
  return Math.max(0, progress / 1000);
}

const idleProfile = createProceduralProfile("idle", "", "", 180000);

export default function MusicVisualizer({ colorMode }: MusicVisualizerProps) {
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

  useEffect(() => {
    colorModeRef.current = colorMode;
    if (colorMode !== "theme" && colorMode !== "random") {
      fixedRef.current = hexToRgb(colorMode);
    }
  }, [colorMode]);

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
            profileRef.current = createProceduralProfile(trackKey, track.name, artistText, track.duration_ms);
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
    const id = setInterval(poll, 900);
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
      section: VisualSection,
      beatPhase: number
    ): number => {
      const phase = EDGE_PHASE[edge] + (profile.seed % 1000) * 0.002;
      const tempoFactor = clamp(section.tempo / 129, 0.65, 1.45);
      const movement = 0.82 + section.density * 0.38;
      let s = 0;
      s += Math.sin(p * Math.PI * 2 * (3 + textureLevel * 0.8) + t * 2.6 * tempoFactor * movement + phase) * 0.5;
      s +=
        Math.sin(
          p * Math.PI * 2 * (7 + section.texture * 1.6) -
            t * 3.7 * tempoFactor * movement +
            phase * 1.3
        ) * 0.3;
      s +=
        Math.sin(
          p * Math.PI * 2 * (13 + profile.dynamicRange * 2.2) +
            t * 5.0 * tempoFactor * (0.8 + textureLevel * 0.55)
        ) * 0.2;
      const travellingBass = Math.sin(
        p * Math.PI * 2 * (1.8 + profile.danceability * 2.4) -
          beatPhase * Math.PI * 2 +
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
      const section = getSection(profile, seconds);
      const beat = getBeatPulse(profile, seconds, section);
      const volume = clamp(volumeRef.current);
      const playing = playback.isPlaying ? 1 : 0;

      const targetLevel =
        playing *
        clamp(
          0.16 +
            volume * 0.38 +
            section.intensity * 0.62 +
            beat.kick * 0.18 -
            profile.acousticness * 0.06,
          0,
          1
        );
      const targetBass =
        playing *
        clamp(
          (beat.kick * 1.65 + section.bass * 0.28) *
            section.bass *
            (0.66 + volume * 0.82) *
            (0.6 + profile.bassWeight * 0.9),
          0,
          1
        );
      const targetTexture =
        playing *
        clamp(
          (section.texture * 0.34 + beat.kick * section.density * 0.66) *
            (0.3 + profile.dynamicRange * 0.82),
          0,
          1
        );

      level = easeToward(level, targetLevel, 9.5, 3.4, dt);
      bassLevel = easeToward(bassLevel, targetBass, 30, 5.2, dt);
      textureLevel = easeToward(textureLevel, targetTexture, 14, 4.4, dt);

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      if (level > 0.006) {
        const minSide = Math.min(w, h);
        const punch = 0.55 + bassLevel * 2.45 + textureLevel * 0.28;
        const maxDepth = Math.min(
          minSide * 0.52,
          minSide *
            0.34 *
            clamp(level * (0.72 + section.intensity * 0.5) + bassLevel * 0.72, 0.05, 1.55) *
            punch
        );
        const [r, g, b] = resolveColor(t);
        const edgeAlpha = Math.min(0.72, 0.55 * level * (0.7 + 0.75 * bassLevel));

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.7 * level})`;
        ctx.shadowBlur = (18 + 34 * bassLevel) * level;

        const depthAt = (p: number, edge: Edge) => {
          const sectionWave = waveNorm(p, t, edge, profile, section, beat.phase);
          return (0.12 + 0.88 * sectionWave) * maxDepth;
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
