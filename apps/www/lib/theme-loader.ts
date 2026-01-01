import type { RawTheme, ThemeConfig, ThemeIndex, ThemeMeta } from "./types/theme";

const DEFAULT_THEME: ThemeConfig = {
  name: "light",
  panel: "linear-gradient(to top, #b7b7b7, #c9c9c9, #dadada, #ededed, #ffffff)",
  panelRadius: 18,
  panelShadow: "0 12px 30px rgba(0, 0, 0, 0.18)",
  controlsColor: "#1A1A1A",
  controlsColorActive: "#000000",
  playbarTrackBg: "rgba(0, 0, 0, 0.14)",
  playbarTrackFill: "linear-gradient(90deg, #444444 0%, #000000 100%)",
  playbarThumbColor: "#000000",
  playbarTimeColor: "rgba(26, 26, 26, 0.65)",
  songTitleColor: "#000000",
  songArtistColor: "rgba(26, 26, 26, 0.65)",
  actionsColor: "#000000",
  actionsBg: "rgba(0, 0, 0, 0.04)",
  actionsBgHover: "rgba(0, 0, 0, 0.10)",
  coverBorderColor: "rgba(0, 0, 0, 0.18)",
  coverRadius: 12,
};

function transformTheme(raw: RawTheme): ThemeConfig {
  return {
    name: raw.name,
    panel: raw.panel?.background ?? DEFAULT_THEME.panel,
    panelRadius: raw.panel?.borderRadius ?? DEFAULT_THEME.panelRadius,
    panelShadow: raw.panel?.shadow ?? DEFAULT_THEME.panelShadow,
    controlsColor: raw.controls?.iconColor ?? DEFAULT_THEME.controlsColor,
    controlsColorActive: raw.controls?.iconColorActive ?? DEFAULT_THEME.controlsColorActive,
    playbarTrackBg: raw.playbar?.trackBg ?? DEFAULT_THEME.playbarTrackBg,
    playbarTrackFill: raw.playbar?.trackFill ?? DEFAULT_THEME.playbarTrackFill,
    playbarThumbColor: raw.playbar?.thumbColor ?? DEFAULT_THEME.playbarThumbColor,
    playbarTimeColor: raw.playbar?.timeTextColor ?? DEFAULT_THEME.playbarTimeColor,
    songTitleColor: raw.typography?.songTitle?.color ?? DEFAULT_THEME.songTitleColor,
    songArtistColor: raw.typography?.songArtist?.color ?? DEFAULT_THEME.songArtistColor,
    actionsColor: raw.actions?.iconColor ?? DEFAULT_THEME.actionsColor,
    actionsBg: raw.actions?.iconBackground ?? DEFAULT_THEME.actionsBg,
    actionsBgHover: raw.actions?.iconBackgroundHover ?? DEFAULT_THEME.actionsBgHover,
    coverBorderColor: raw.cover?.borderColor ?? DEFAULT_THEME.coverBorderColor,
    coverRadius: raw.cover?.borderRadius ?? DEFAULT_THEME.coverRadius,
  };
}

export async function fetchThemeIndex(): Promise<ThemeIndex> {
  const response = await fetch("/themes/index.json");
  if (!response.ok) {
    throw new Error(`Failed to fetch theme index: ${response.statusText}`);
  }
  return response.json() as Promise<ThemeIndex>;
}

export async function fetchTheme(themeMeta: ThemeMeta): Promise<ThemeConfig> {
  const response = await fetch(`/themes/${themeMeta.file}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch theme ${themeMeta.id}: ${response.statusText}`);
  }
  const raw = (await response.json()) as RawTheme;
  return transformTheme(raw);
}

export async function fetchAllThemes(index: ThemeIndex): Promise<Map<string, ThemeConfig>> {
  const themes = new Map<string, ThemeConfig>();
  const promises = index.themes.map(async (meta) => {
    const theme = await fetchTheme(meta);
    themes.set(meta.id, theme);
  });
  await Promise.all(promises);
  return themes;
}

export { DEFAULT_THEME };
