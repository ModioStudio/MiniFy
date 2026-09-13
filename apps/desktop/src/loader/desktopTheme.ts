import { invoke } from "@tauri-apps/api/core";
import type { ThemeConfig } from "./themeLoader";

/**
 * Derives the desktop shell's surface palette from a MiniFy theme.
 *
 * Themes were written for the mini player, which floats over the desktop and
 * therefore uses translucent panels (`rgba(18,18,18,0.85)`). A full window has
 * nothing behind it, so those colours have to be flattened onto an opaque base
 * and then tinted into a small set of elevations. Doing it here keeps every
 * existing theme — including user-authored ones — working on the desktop shell
 * without asking authors to add desktop-specific keys.
 */

type Rgb = { r: number; g: number; b: number };

const FALLBACK_BASE: Rgb = { r: 16, g: 16, b: 16 };

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(input: string): (Rgb & { a: number }) | null {
  const hex = input.replace("#", "").trim();
  const expand = (part: string) => Number.parseInt(part.repeat(2), 16);

  if (hex.length === 3 || hex.length === 4) {
    return {
      r: expand(hex[0] as string),
      g: expand(hex[1] as string),
      b: expand(hex[2] as string),
      a: hex.length === 4 ? expand(hex[3] as string) / 255 : 1,
    };
  }

  if (hex.length === 6 || hex.length === 8) {
    const pair = (index: number) => Number.parseInt(hex.slice(index, index + 2), 16);
    return {
      r: pair(0),
      g: pair(2),
      b: pair(4),
      a: hex.length === 8 ? pair(6) / 255 : 1,
    };
  }

  return null;
}

function parseFunctional(input: string): (Rgb & { a: number }) | null {
  const match = input.match(/^(rgba?|hsla?)\(([^)]+)\)$/i);
  if (!match) return null;

  const parts = (match[2] as string)
    .split(/[,/\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);

  if ((match[1] as string).toLowerCase().startsWith("rgb")) {
    return {
      r: Number.parseFloat(parts[0] as string),
      g: Number.parseFloat(parts[1] as string),
      b: Number.parseFloat(parts[2] as string),
      a: Number.isFinite(alpha) ? alpha : 1,
    };
  }

  const hue = ((Number.parseFloat(parts[0] as string) % 360) + 360) % 360;
  const saturation = Number.parseFloat(parts[1] as string) / 100;
  const lightness = Number.parseFloat(parts[2] as string) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  const sector = Math.floor(hue / 60) % 6;
  const table: Array<[number, number, number]> = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ];
  const [r, g, b] = table[sector] as [number, number, number];

  return {
    r: (r + offset) * 255,
    g: (g + offset) * 255,
    b: (b + offset) * 255,
    a: Number.isFinite(alpha) ? alpha : 1,
  };
}

/** Flattens any CSS colour onto `base`. Gradients and keywords fall back. */
function flatten(input: string | undefined, base: Rgb): Rgb {
  if (!input) return base;
  const parsed = input.startsWith("#") ? parseHex(input) : parseFunctional(input);
  if (!parsed || !Number.isFinite(parsed.r)) return base;

  const alpha = Math.max(0, Math.min(1, parsed.a));
  return {
    r: clamp255(parsed.r * alpha + base.r * (1 - alpha)),
    g: clamp255(parsed.g * alpha + base.g * (1 - alpha)),
    b: clamp255(parsed.b * alpha + base.b * (1 - alpha)),
  };
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: clamp255(color.r + (target.r - color.r) * amount),
    g: clamp255(color.g + (target.g - color.g) * amount),
    b: clamp255(color.b + (target.b - color.b) * amount),
  };
}

function toCss({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function toHex({ r, g, b }: Rgb): string {
  const pair = (value: number) => clamp255(value).toString(16).padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/**
 * The desktop window keeps the system title bar, which Windows would otherwise
 * paint in its own accent colour regardless of the MiniFy theme.
 */
function syncNativeTitlebar(background: Rgb, foreground: Rgb): void {
  invoke("set_titlebar_color", {
    background: toHex(background),
    foreground: toHex(foreground),
  }).catch(() => {
    // No Tauri host, or a platform without themable window chrome.
  });
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function applyDesktopThemeVars(theme: ThemeConfig): void {
  const root = document.documentElement;

  const base = flatten(theme.panel, FALLBACK_BASE);
  const luminance = relativeLuminance(base);
  const isLight = luminance > 0.45;

  // Elevations move away from the base toward white on dark themes and toward
  // black on light ones, so contrast behaves the same in both directions.
  const lift: Rgb = isLight ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  const sink: Rgb = isLight ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };

  const accent = theme.settings?.accent ?? "#1ed760";
  const accentRgb = flatten(accent, base);
  const accentContrast = relativeLuminance(accentRgb) > 0.5 ? "#0b0b0b" : "#ffffff";

  const text = theme.settings?.text ?? (isLight ? "#101010" : "#f7f5ef");
  const muted =
    theme.settings?.textMuted ?? (isLight ? "rgba(16,16,16,0.66)" : "rgba(247,245,239,0.66)");

  const vars: Record<string, string> = {
    "--desktop-bg": toCss(mix(base, sink, 0.35)),
    "--desktop-bg-raised": toCss(base),
    "--desktop-surface": toCss(mix(base, lift, 0.06)),
    "--desktop-surface-strong": toCss(mix(base, lift, 0.12)),
    "--desktop-surface-hover": toCss(mix(base, lift, 0.16)),
    "--desktop-border": theme.settings?.panelBorder ?? toCss(mix(base, lift, 0.18)),
    "--desktop-chrome": toCss(mix(base, sink, 0.18)),
    "--desktop-text": text,
    "--desktop-muted": muted,
    "--desktop-dim": isLight ? "rgba(16,16,16,0.4)" : "rgba(247,245,239,0.4)",
    "--desktop-accent": accent,
    "--desktop-accent-contrast": accentContrast,
    "--desktop-accent-soft": toCss(mix(base, accentRgb, 0.22)),
    "--desktop-radius": `${theme.panelRadius ?? 14}px`,
    "--desktop-scheme": isLight ? "light" : "dark",
  };

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty("color-scheme", isLight ? "light" : "dark");

  syncNativeTitlebar(mix(base, sink, 0.18), flatten(text, base));
}
