/**
 * MiniFy Auth Clear Tool
 *
 * Cross-platform script to clear all authentication data from MiniFy.
 * Supports: Windows, macOS, Linux
 *
 * Usage: node scripts/clear-auth.js
 */

import { exec } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
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
  "ai_key_openai",
  "ai_key_anthropic",
  "ai_key_google",
  "ai_key_groq",
];

/**
 * Get the settings file path based on the current platform
 */
function getSettingsPath() {
  const platform = process.platform;

  switch (platform) {
    case "win32": {
      const appData = process.env.APPDATA;
      if (!appData) {
        throw new Error("APPDATA environment variable not found");
      }
      return join(appData, "MiniFy", "settings.json");
    }
    case "darwin":
      return join(homedir(), "Library", "Application Support", "MiniFy", "settings.json");
    case "linux":
      return join(
        process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
        "MiniFy",
        "settings.json"
      );
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Clear Windows Credential Manager entries
 */
async function clearWindowsCredentials() {
  console.log("🔑 Clearing Windows Credential Manager entries...");

  for (const key of KEYRING_KEYS) {
    const target = `${key}.${KEYRING_SERVICE}`;
    try {
      await execAsync(`cmdkey /delete:${target}`);
      console.log(`  ✓ Deleted: ${target}`);
    } catch (err) {
      const message = err?.stderr || err?.message || String(err);
      if (message.includes("not found") || message.includes("Element not found")) {
        console.log(`  - Not found: ${target}`);
      } else {
        console.error(`  ✗ Error deleting ${target}:`, message);
      }
    }
  }
}

/**
 * Clear macOS Keychain entries using security CLI
 */
async function clearMacOSCredentials() {
  console.log("🔑 Clearing macOS Keychain entries...");

  for (const key of KEYRING_KEYS) {
    const service = `${key}.${KEYRING_SERVICE}`;
    try {
      await execAsync(`security delete-generic-password -s "${service}" 2>/dev/null`);
      console.log(`  ✓ Deleted: ${service}`);
    } catch (err) {
      const message = err?.stderr || err?.message || String(err);
      if (message.includes("could not be found") || message.includes("SecKeychainSearchCopyNext")) {
        console.log(`  - Not found: ${service}`);
      } else {
        console.error(`  ✗ Error deleting ${service}:`, message);
      }
    }
  }
}

/**
 * Clear Linux Secret Service entries using secret-tool CLI
 */
async function clearLinuxCredentials() {
  console.log("🔑 Clearing Linux Secret Service entries...");

  // Check if secret-tool is available
  try {
    await execAsync("which secret-tool");
  } catch {
    console.log("  ⚠ secret-tool not found. Install libsecret-tools to clear credentials.");
    console.log("    On Ubuntu/Debian: sudo apt install libsecret-tools");
    console.log("    On Fedora: sudo dnf install libsecret");
    console.log("    Skipping credential clearing...");
    return;
  }

  for (const key of KEYRING_KEYS) {
    const service = `${key}.${KEYRING_SERVICE}`;
    try {
      await execAsync(`secret-tool clear service "${service}"`);
      console.log(`  ✓ Deleted: ${service}`);
    } catch (err) {
      const message = err?.stderr || err?.message || String(err);
      if (message.includes("No matching") || err?.code === 0) {
        console.log(`  - Not found: ${service}`);
      } else {
        console.error(`  ✗ Error deleting ${service}:`, message);
      }
    }
  }
}

/**
 * Clear credentials based on the current platform
 */
async function clearCredentials() {
  const platform = process.platform;

  switch (platform) {
    case "win32":
      await clearWindowsCredentials();
      break;
    case "darwin":
      await clearMacOSCredentials();
      break;
    case "linux":
      await clearLinuxCredentials();
      break;
    default:
      console.error(`❌ Unsupported platform: ${platform}`);
      console.error("   Supported platforms: win32, darwin, linux");
      process.exit(1);
  }
}

/**
 * Clear the settings file
 */
async function clearSettingsFile() {
  console.log("\n📁 Clearing settings file...");
  console.log("   This includes: provider settings, themes, layout");

  try {
    const settingsPath = getSettingsPath();
    await rm(settingsPath);
    console.log(`  ✓ Deleted: ${settingsPath}`);
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.log("  - Not found: settings.json (already clean)");
    } else {
      console.error("  ✗ Error deleting settings file:", err?.message || err);
      process.exit(1);
    }
  }
}

async function main() {
  console.log("🧹 MiniFy Auth Clear Tool\n");
  console.log(`   Platform: ${process.platform}`);
  console.log("   Clears: Spotify tokens, AI API keys, settings");
  console.log("=".repeat(40));

  await clearCredentials();
  await clearSettingsFile();

  console.log(`\n${"=".repeat(40)}`);
  console.log("✅ All credentials and settings cleared.");
  console.log("   - Spotify tokens removed from keyring");
  console.log("   - AI API keys removed from keyring");
  console.log("   - Settings file deleted");
  console.log("\nRestart the app to trigger first-boot flow.");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err?.message || err);
  process.exit(1);
});
