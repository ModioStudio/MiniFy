import { useEffect, useRef } from "react";
import { readSettings } from "../../lib/settingLib";
import { getActiveProvider, getActiveProviderType } from "../../providers";
import { getPlayerState } from "../spotifyClient";

/**
 * Music Visualizer
 *
 * Renders a soft, wave-like glow that hugs the inner edge of the app window and
 * reaches inward, reacting to playback. Because both music backends run out of
 * process (Spotify Connect = remote device, YouTube = sandboxed iframe) there is
 * no local audio stream available for real FFT analysis. Instead the motion is
 * driven procedurally: it only comes alive while music is playing, its amplitude
 * scales with the current output volume, and a punchy "kick" envelope makes it
 * swing on every simulated beat so it feels like it reacts to the bass.
 *
 * Rendered as a pointer-events-none overlay so the player underneath stays fully
 * usable and visible.
 */

type Edge = "top" | "bottom" | "left" | "right";

/** colorMode: "theme" (accent), "random" (smoothly cycling hue), or a hex string. */
type MusicVisualizerProps = {
  colorMode: string;
};

const EDGE_PHASE: Record<Edge, number> = {
  top: 0,
  right: 1.7,
  bottom: 3.3,
  left: 5.1,
};

// How many samples per edge — enough to look smooth, cheap to draw.
const SAMPLES = 48;

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
  return [116, 199, 236]; // fallback accent (#74C7EC)
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

export default function MusicVisualizer({ colorMode }: MusicVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Playback signals updated by the poll loop, read by the animation loop.
  // Stored in refs so polling never triggers React re-renders.
  const playingRef = useRef<boolean>(false);
  const volumeRef = useRef<number>(0.6); // 0..1

  // Colour state
  const colorModeRef = useRef<string>(colorMode);
  const accentRef = useRef<[number, number, number]>([116, 199, 236]);
  const fixedRef = useRef<[number, number, number]>([116, 199, 236]);

  // ---- Keep colour mode in sync with the setting (live, no remount needed)
  useEffect(() => {
    colorModeRef.current = colorMode;
    if (colorMode !== "theme" && colorMode !== "random") {
      fixedRef.current = hexToRgb(colorMode);
    }
  }, [colorMode]);

  // ---- Poll playback state + volume (read-only, no side effects)
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const type = await getActiveProviderType();

        if (type === "spotify") {
          // One call gives us both playing state and device volume.
          const state = await getPlayerState();
          if (cancelled) return;
          if (state) {
            playingRef.current = state.is_playing;
            if (state.device) volumeRef.current = state.device.volume_percent / 100;
          } else {
            playingRef.current = false;
          }
        } else {
          const provider = await getActiveProvider();
          const playback = await provider.getPlaybackState();
          if (cancelled) return;
          playingRef.current = playback?.isPlaying ?? false;
          const settings = await readSettings();
          if (cancelled) return;
          volumeRef.current = (settings.youtube_volume ?? 50) / 100;
        }
      } catch {
        // Ignore transient API/network errors; keep last known state.
      }
    };

    void poll();
    const id = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ---- Refresh accent colour from the active theme (only needed in "theme" mode)
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

  // ---- Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let level = 0; // eased 0..1 overall intensity
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

    // Procedural "spectrum" height at position p (0..1) on an edge. Faster motion
    // than before so the waves visibly travel along the edges.
    const waveNorm = (p: number, t: number, phase: number): number => {
      let s = 0;
      s += Math.sin(p * Math.PI * 2 * 3 + t * 2.6 + phase) * 0.5;
      s += Math.sin(p * Math.PI * 2 * 7 - t * 3.7 + phase * 1.3) * 0.3;
      s += Math.sin(p * Math.PI * 2 * 13 + t * 5.0) * 0.2;
      return (s + 1) / 2; // -> 0..1
    };

    const resolveColor = (t: number): [number, number, number] => {
      const mode = colorModeRef.current;
      if (mode === "random") return hslToRgb(t * 14, 0.85, 0.62); // full hue cycle ~26s
      if (mode === "theme") return accentRef.current;
      return fixedRef.current;
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      // Ease overall level toward target. Snappy attack so it reacts quickly to
      // play/pause and volume changes. Louder = stronger swing.
      const target = playingRef.current
        ? 0.45 + 0.55 * Math.min(1, Math.max(0, volumeRef.current))
        : 0;
      level += (target - level) * Math.min(1, dt * 9);

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      if (level > 0.01) {
        // Punchy "kick" envelope: spikes on every simulated beat, then decays
        // fast — this is what makes the border slam inward on the bass. A weaker
        // off-beat pulse keeps it lively between kicks.
        const beat = 2.15; // ~129 BPM
        const ph = (t * beat) % 1;
        const kick = Math.exp(-ph * 7) + 0.4 * Math.exp(-((ph + 0.5) % 1) * 9);
        const punch = 0.5 + 1.15 * Math.min(1, kick);

        const maxDepth = Math.min(w, h) * 0.34 * level * punch;

        const [r, g, b] = resolveColor(t);
        const edgeAlpha = Math.min(0.72, 0.55 * level * (0.7 + 0.5 * Math.min(1, kick)));

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.7 * level})`;
        ctx.shadowBlur = (18 + 26 * Math.min(1, kick)) * level;

        const depthAt = (p: number, edge: Edge) =>
          (0.14 + 0.86 * waveNorm(p, t, EDGE_PHASE[edge])) * maxDepth;

        const grad = (x0: number, y0: number, x1: number, y1: number) => {
          const gr = ctx.createLinearGradient(x0, y0, x1, y1);
          gr.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${edgeAlpha})`);
          gr.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${edgeAlpha * 0.35})`);
          gr.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          return gr;
        };

        // Top
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

        // Bottom
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

        // Left
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

        // Right
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
