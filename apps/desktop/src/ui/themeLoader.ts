import catppuccin from "../themes/catppuccin.json" assert { type: "json" };
import dark from "../themes/dark.json" assert { type: "json" };
import dracula from "../themes/dracula.json" assert { type: "json" };
import light from "../themes/light.json" assert { type: "json" };

export type ThemeConfig = {
  name: string;
  panel: string;
  panel50: string;
  panel40: string;
  text: string;
  text90: string;
  text70: string;
};

export const THEMES: Record<string, ThemeConfig> = {
  dark: dark as ThemeConfig,
  light: light as ThemeConfig,
  dracula: dracula as ThemeConfig,
  catppuccin: catppuccin as ThemeConfig,
};

export function applyThemeByName(themeName: string): void {
  const t = THEMES[themeName] ?? THEMES.dark;
  const root = document.documentElement;
  root.style.setProperty("--panel-bg", t.panel);
  root.style.setProperty("--panel-bg-50", t.panel50);
  root.style.setProperty("--panel-bg-40", t.panel40);
  root.style.setProperty("--text-color", t.text);
  root.style.setProperty("--text-color-90", t.text90);
  root.style.setProperty("--text-color-70", t.text70);
}
