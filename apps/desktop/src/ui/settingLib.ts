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
