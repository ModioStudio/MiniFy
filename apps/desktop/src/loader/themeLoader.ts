import catppuccin from "../themes/catppuccin.json" assert { type: "json" };
import dark from "../themes/dark.json" assert { type: "json" };
import dracula from "../themes/dracula.json" assert { type: "json" };
import light from "../themes/light.json" assert { type: "json" };
import milka from "../themes/milka.json" assert { type: "json" };
import bmw from "../themes/bmw.json" assert { type: "json" };
import youtube from "../themes/youtube.json" assert { type: "json" };
import chatgpt from "../themes/chatgpt.json" assert { type: "json" };

export type ThemeConfig = {
  name: string;

  // Panel
  panel?: string;
  panel50?: string;
  panel40?: string;
  text?: string;
  text90?: string;
  text70?: string;
  panelRadius?: number;
  panelShadow?: string;

  // Controls
  controlsColor?: string;
  controlsColorActive?: string;

  // Playbar
  playbarTrackBg?: string;
  playbarTrackFill?: string;
  playbarThumbColor?: string;
  playbarTimeColor?: string;

  // Typography
  songTitleColor?: string;
  songArtistColor?: string;

  // Actions
  actionsColor?: string;
  actionsBg?: string;
  actionsBgHover?: string;

  // Cover
  coverBorderColor?: string;
  coverRadius?: number;

  // Settings
  settings?: {
    panelBg?: string;
    panelBorder?: string;
    text?: string;
    textMuted?: string;
    itemHover?: string;
    itemActive?: string;
    accent?: string;
  };
};

type RawTheme = {
  name: string;
  panel?: { background?: string; borderRadius?: number; shadow?: string };
  controls?: { iconColor?: string; iconColorActive?: string };
  playbar?: { trackBg?: string; trackFill?: string; thumbColor?: string; timeTextColor?: string };
  typography?: { songTitle?: { color?: string }; songArtist?: { color?: string } };
  actions?: { iconColor?: string; iconBackground?: string; iconBackgroundHover?: string };
  cover?: { borderColor?: string; borderRadius?: number };
  settings?: {
    panelBg?: string;
    panelBorder?: string;
    text?: string;
    textMuted?: string;
    itemHover?: string;
    itemActive?: string;
    accent?: string;
  };
};

function transformTheme(theme: RawTheme): ThemeConfig {
  return {
    name: theme.name,
    panel: theme.panel?.background || theme.settings?.panelBg || "#000000",
    panelRadius: theme.panel?.borderRadius,
    panelShadow: theme.panel?.shadow,
    controlsColor: theme.controls?.iconColor,
    controlsColorActive: theme.controls?.iconColorActive,
    playbarTrackBg: theme.playbar?.trackBg,
    playbarTrackFill: theme.playbar?.trackFill,
    playbarThumbColor: theme.playbar?.thumbColor,
    playbarTimeColor: theme.playbar?.timeTextColor,
    songTitleColor: theme.typography?.songTitle?.color,
    songArtistColor: theme.typography?.songArtist?.color,
    actionsColor: theme.actions?.iconColor,
    actionsBg: theme.actions?.iconBackground,
    actionsBgHover: theme.actions?.iconBackgroundHover,
    coverBorderColor: theme.cover?.borderColor,
    coverRadius: theme.cover?.borderRadius,
    settings: theme.settings,
  };
}

export const THEMES: Record<string, ThemeConfig> = {
  dark: transformTheme(dark),
  light: transformTheme(light),
  dracula: transformTheme(dracula),
  catppuccin: transformTheme(catppuccin),
  milka: transformTheme(milka),
  bmw: transformTheme(bmw),
  youtube: transformTheme(youtube),
  chatgpt: transformTheme(chatgpt),
};

export function applyThemeByName(themeName: string): void {
  const t = THEMES[themeName] ?? THEMES.dark;
  const root = document.documentElement;

  // Panel
  root.style.setProperty("--player-panel-bg", t.panel ?? "#000000");
  root.style.setProperty("--player-panel-radius", `${t.panelRadius ?? 18}px`);
  root.style.setProperty("--player-panel-shadow", t.panelShadow ?? "0 14px 40px rgba(0,0,0,0.55)");

  // Controls
  root.style.setProperty("--player-controls-color", t.controlsColor ?? "#ffffff");
  root.style.setProperty("--player-controls-color-active", t.controlsColorActive ?? "#ffffff");

  // Playbar
  root.style.setProperty("--player-playbar-track-bg", t.playbarTrackBg ?? "rgba(255,255,255,0.16)");
  root.style.setProperty(
    "--player-playbar-track-fill",
    t.playbarTrackFill ?? "linear-gradient(90deg, #74C7EC 0%, #89B4FA 100%)"
  );
  root.style.setProperty("--player-playbar-thumb-color", t.playbarThumbColor ?? "#ffffff");
  root.style.setProperty(
    "--player-playbar-time-color",
    t.playbarTimeColor ?? t.text70 ?? "#b0b0b0"
  );

  // Typography
  root.style.setProperty("--player-song-title-color", t.songTitleColor ?? "#ffffff");
  root.style.setProperty("--player-song-artist-color", t.songArtistColor ?? t.text70 ?? "#b0b0b0");

  // Actions
  root.style.setProperty("--player-actions-color", t.actionsColor ?? "#ffffff");
  root.style.setProperty("--player-actions-bg", t.actionsBg ?? "rgba(255,255,255,0.04)");
  root.style.setProperty("--player-actions-bg-hover", t.actionsBgHover ?? "rgba(255,255,255,0.10)");

  // Cover
  root.style.setProperty(
    "--player-cover-border-color",
    t.coverBorderColor ?? "rgba(255,255,255,0.20)"
  );
  root.style.setProperty("--player-cover-radius", `${t.coverRadius ?? 12}px`);

  // Settings
  root.style.setProperty("--settings-panel-bg", t.settings?.panelBg ?? "#000000");
  root.style.setProperty("--settings-panel-border", t.settings?.panelBorder ?? "#ffffff1a");
  root.style.setProperty("--settings-text", t.settings?.text ?? "#ffffff");
  root.style.setProperty("--settings-text-muted", t.settings?.textMuted ?? "#e0e0e0");
  root.style.setProperty("--settings-item-hover", t.settings?.itemHover ?? "#ffffff14");
  root.style.setProperty("--settings-item-active", t.settings?.itemActive ?? "#ffffff24");
  root.style.setProperty("--settings-accent", t.settings?.accent ?? "#74C7EC");
}
