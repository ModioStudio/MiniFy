import { invoke } from "@tauri-apps/api/core";

export type SpotifyTokens = {
  access_token: string | null;
  refresh_token: string | null;
};

export type AIProviderType = "openai" | "anthropic" | "google" | "groq";
export type MusicProviderType = "spotify" | "apple" | "youtube";

export type AIProviderConfig = {
  provider: AIProviderType;
  enabled: boolean;
};

export async function saveAIApiKey(provider: AIProviderType, apiKey: string): Promise<void> {
  await invoke("save_ai_api_key", { provider, apiKey });
}

/**
 * Retrieves an AI API key from the secure keyring.
 * @param provider - The AI provider type
 * @returns The API key if found, null if not found
 * @throws Error for keyring access failures (not for missing keys)
 */
export async function getAIApiKey(provider: AIProviderType): Promise<string | null> {
  try {
    return await invoke("get_ai_api_key", { provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("No password found")) {
      return null;
    }
    throw error;
  }
}

export async function hasAIApiKey(provider: AIProviderType): Promise<boolean> {
  return await invoke("has_ai_api_key", { provider });
}

export async function deleteAIApiKey(provider: AIProviderType): Promise<void> {
  await invoke("delete_ai_api_key", { provider });
}

export async function clearAllAIKeys(): Promise<void> {
  await invoke("clear_all_ai_keys");
}

export type Settings = {
  first_boot_done: boolean;
  spotify: SpotifyTokens;
  layout: string;
  theme: string;
  ai_providers: AIProviderConfig[];
  active_ai_provider: AIProviderType | null;
  active_music_provider: MusicProviderType | null;
  show_ai_queue_border: boolean;
  discord_rpc_enabled: boolean;
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
    headerText?: string;
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
    return {
      ...settings,
      ai_providers: settings.ai_providers ?? [],
      active_ai_provider: settings.active_ai_provider ?? null,
      active_music_provider: settings.active_music_provider ?? "spotify",
      show_ai_queue_border: settings.show_ai_queue_border ?? true,
      discord_rpc_enabled: settings.discord_rpc_enabled ?? false,
    };
  } catch (err) {
    console.warn("Failed to read settings via Tauri, using defaults:", err);
    return {
      first_boot_done: false,
      spotify: { access_token: null, refresh_token: null },
      layout: "LayoutA",
      theme: "dark",
      ai_providers: [],
      active_ai_provider: null,
      active_music_provider: "spotify",
      show_ai_queue_border: true,
      discord_rpc_enabled: false,
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
