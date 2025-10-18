import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

const SETTINGS_FILENAME = "settings.json";

async function getSettingsPath(): Promise<string> {
  const dir = await appDataDir();
  return join(dir, SETTINGS_FILENAME);
}

export async function readSettings(): Promise<any> {
  try {
    const path = await getSettingsPath();
    const raw = await readTextFile(path);
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to read settings, returning default:", err);
    return {
      firstBootDone: false,
      spotify: { accessToken: null, refreshToken: null },
      layout: "LayoutA",
      theme: "dark"
    };
  }
}

export async function writeSettings(update: any): Promise<void> {
  const path = await getSettingsPath();
  const current = await readSettings();
  const merged = { ...current, ...update }; 
  await writeTextFile(path, JSON.stringify(merged, null, 2));
}
