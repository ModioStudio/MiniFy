import type { MusicProvider, MusicProviderType } from "./types";
import { readSettings } from "../lib/settingLib";
import { createSpotifyProvider } from "./spotify";
import { createYouTubeProvider } from "./youtube";

type ProviderConstructor = () => MusicProvider;

const providerRegistry = new Map<MusicProviderType, ProviderConstructor>();

let cachedProvider: MusicProvider | null = null;
let cachedProviderType: MusicProviderType | null = null;

export function registerProvider(
  type: MusicProviderType,
  constructor: ProviderConstructor
): void {
  providerRegistry.set(type, constructor);
}

export function getRegisteredProviders(): MusicProviderType[] {
  return Array.from(providerRegistry.keys());
}

export function hasProvider(type: MusicProviderType): boolean {
  return providerRegistry.has(type);
}

export async function getActiveProviderType(): Promise<MusicProviderType> {
  const settings = await readSettings();
  return settings.active_music_provider ?? "spotify";
}

export async function getActiveProvider(): Promise<MusicProvider> {
  const activeType = await getActiveProviderType();

  if (cachedProvider && cachedProviderType === activeType) {
    return cachedProvider;
  }

  const constructor = providerRegistry.get(activeType);
  if (!constructor) {
    throw new Error(`No provider registered for type: ${activeType}`);
  }

  cachedProvider = constructor();
  cachedProviderType = activeType;
  return cachedProvider;
}

export function getProvider(type: MusicProviderType): MusicProvider {
  const constructor = providerRegistry.get(type);
  if (!constructor) {
    throw new Error(`No provider registered for type: ${type}`);
  }
  return constructor();
}

export function clearProviderCache(): void {
  cachedProvider = null;
  cachedProviderType = null;
}

export async function isProviderAuthenticated(
  type: MusicProviderType
): Promise<boolean> {
  const constructor = providerRegistry.get(type);
  if (!constructor) {
    return false;
  }
  const provider = constructor();
  return provider.isAuthenticated();
}

registerProvider("spotify", createSpotifyProvider);
registerProvider("youtube", createYouTubeProvider);
