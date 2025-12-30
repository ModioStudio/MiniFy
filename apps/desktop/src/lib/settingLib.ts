import { invoke } from "@tauri-apps/api/core";

export type SpotifyTokens = {
  access_token: string | null;
  refresh_token: string | null;
};

export type Settings = {
  first_boot_done: boolean;
  spotify: SpotifyTokens;
  layout: string;
  theme: string;
};

export type CustomTheme = {
  name: string;
  panel?: {
    background?: string;
    borderRadius?: number;
    shadow?: string;
  };
  settings?: {
    panelBg?: string;
    panelBorder?: string;
    text?: string;
    textMuted?: string;
    itemHover?: string;
    itemActive?: string;
    accent?: string;
  };
  controls?: {
    iconColor?: string;
    iconColorActive?: string;
    iconBackground?: string;
    iconBackgroundHover?: string;
  };
  playbar?: {
    trackBg?: string;
    trackFill?: string;
    thumbColor?: string;
    timeTextColor?: string;
  };
  typography?: {
    songTitle?: { color?: string; weight?: number };
    songArtist?: { color?: string; weight?: number };
  };
  actions?: {
    iconColor?: string;
    iconBackground?: string;
    iconBackgroundHover?: string;
  };
  cover?: {
    borderColor?: string;
    borderRadius?: number;
  };
};

export async function readSettings(): Promise<Settings> {
  try {
    const settings: Settings = await invoke("read_settings");
    return settings;
  } catch (err) {
    console.warn("Failed to read settings via Tauri, using defaults:", err);
    return {
      first_boot_done: false,
      spotify: { access_token: null, refresh_token: null },
      layout: "LayoutA",
      theme: "dark",
    };
  }
}

export async function writeSettings(update: Partial<Settings>): Promise<void> {
  try {
    const current = await readSettings();
    const merged: Settings = { ...current, ...update };
    await invoke("write_settings", { settings: merged });
  } catch (err) {
    console.error("Failed to write settings via Tauri:", err);
  }
}

export async function saveCustomTheme(themeJson: string): Promise<string> {
  const filename: string = await invoke("save_custom_theme", { themeJson });
  return filename;
}

export async function loadCustomThemes(): Promise<CustomTheme[]> {
  const themes: CustomTheme[] = await invoke("load_custom_themes");
  return themes;
}

export async function deleteCustomTheme(themeName: string): Promise<boolean> {
  const result: boolean = await invoke("delete_custom_theme", { themeName });
  return result;
}

export async function exportCustomTheme(themeName: string): Promise<string> {
  const json: string = await invoke("export_custom_theme", { themeName });
  return json;
}

export async function validateThemeJson(themeJson: string): Promise<boolean> {
  const valid: boolean = await invoke("validate_theme_json", { themeJson });
  return valid;
}
