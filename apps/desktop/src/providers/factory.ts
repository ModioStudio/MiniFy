import { listen } from "@tauri-apps/api/event";
import { readSettings, SETTINGS_CHANGED_EVENT, type Settings } from "../lib/settingLib";
import { createSpotifyProvider } from "./spotify";
import type { MusicProvider, MusicProviderType } from "./types";

type ProviderConstructor = () => MusicProvider;

const providerRegistry = new Map<MusicProviderType, ProviderConstructor>();

let cachedProvider: MusicProvider | null = null;
let cachedProviderType: MusicProviderType | null = null;

let activeType: MusicProviderType | null = null;
let activeTypeRequest: Promise<MusicProviderType> | null = null;
let followingSettings = false;

export function registerProvider(
  type: MusicProviderType,
  providerFactory: ProviderConstructor
): void {
  providerRegistry.set(type, providerFactory);
}

export function getRegisteredProviders(): MusicProviderType[] {
  return Array.from(providerRegistry.keys());
}

export function hasProvider(type: MusicProviderType): boolean {
  return providerRegistry.has(type);
}

/** Every settings write is broadcast to all windows; that keeps the copy current. */
function followSettings(): void {
  if (followingSettings) return;
  followingSettings = true;
  listen<Settings>(SETTINGS_CHANGED_EVENT, (event) => {
    if (event.payload?.active_music_provider) {
      activeType = "spotify";
    }
  }).catch(() => {
    followingSettings = false;
  });
}

/**
 * The active provider, from memory. It used to read the whole settings file
 * through Rust on every call, and playback asks on every Spotify state change
 * and every poll: on a track switch that queued calls into Rust for over a
 * minute, and everything else waiting on Rust (tokens, settings) with them.
 */
export async function getActiveProviderType(): Promise<MusicProviderType> {
  followSettings();
  if (activeType) return activeType;

  activeTypeRequest ??= readSettings()
    .then((settings) => {
      activeType = settings.active_music_provider ?? "spotify";
      return activeType;
    })
    .finally(() => {
      activeTypeRequest = null;
    });
  return activeTypeRequest;
}

export async function getActiveProvider(): Promise<MusicProvider> {
  const type = await getActiveProviderType();

  if (cachedProvider && cachedProviderType === type) {
    return cachedProvider;
  }

  const providerFactory = providerRegistry.get(type);
  if (!providerFactory) {
    throw new Error(`No provider registered for type: ${type}`);
  }

  cachedProvider = providerFactory();
  cachedProviderType = type;
  return cachedProvider;
}

export function getProvider(type: MusicProviderType): MusicProvider {
  const providerFactory = providerRegistry.get(type);
  if (!providerFactory) {
    throw new Error(`No provider registered for type: ${type}`);
  }
  return providerFactory();
}

/** Also forgets the active type, so a provider switch is read afresh. */
export function clearProviderCache(): void {
  cachedProvider = null;
  cachedProviderType = null;
  activeType = null;
}

export async function isProviderAuthenticated(type: MusicProviderType): Promise<boolean> {
  const providerFactory = providerRegistry.get(type);
  if (!providerFactory) {
    return false;
  }
  const provider = providerFactory();
  return provider.isAuthenticated();
}

registerProvider("spotify", createSpotifyProvider);
