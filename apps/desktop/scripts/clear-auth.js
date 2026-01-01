import { exec } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const KEYRING_SERVICE = "minify";
const KEYRING_KEYS = [
  "access_token",
  "refresh_token",
  "token_expiry",
  "music_provider",
  "spotify_client_id",
];

async function clearWindowsCredentials() {
  console.log("🔑 Clearing Windows Credential Manager entries...");

  for (const key of KEYRING_KEYS) {
    const target = `${key}.${KEYRING_SERVICE}`;
    try {
      await execAsync(`cmdkey /delete:${target}`);
      console.log(`  ✓ Deleted: ${target}`);
    } catch {
      console.log(`  - Not found: ${target}`);
    }
  }
}

async function clearSettingsFile() {
  console.log("\n📁 Clearing settings file...");

  const appDataPath = process.env.APPDATA;
  if (!appDataPath) {
    console.log("  ⚠ APPDATA environment variable not found");
    return;
  }

  const settingsPath = join(appDataPath, "MiniFy", "settings.json");

  try {
    await rm(settingsPath);
    console.log(`  ✓ Deleted: ${settingsPath}`);
  } catch {
    console.log(`  - Not found: ${settingsPath}`);
  }
}

async function main() {
  console.log("🧹 MiniFy Auth Clear Tool\n");
  console.log("=".repeat(40));

  await clearWindowsCredentials();
  await clearSettingsFile();

  console.log(`\n${"=".repeat(40)}`);
  console.log("✅ Auth data cleared. Restart the app to trigger first-boot flow.");
}

main().catch(console.error);
