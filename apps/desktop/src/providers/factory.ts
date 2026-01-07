import { readSettings } from "../lib/settingLib";
import { createSpotifyProvider } from "./spotify";
import type { MusicProvider, MusicProviderType } from "./types";
import { createYouTubeProvider } from "./youtube";

type ProviderConstructor = () => MusicProvider;

const providerRegistry = new Map<MusicProviderType, ProviderConstructor>();

let cachedProvider: MusicProvider | null = null;
let cachedProviderType: MusicProviderType | null = null;

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

export async function getActiveProviderType(): Promise<MusicProviderType> {
  const settings = await readSettings();
  return settings.active_music_provider ?? "spotify";
}

export async function getActiveProvider(): Promise<MusicProvider> {
  const activeType = await getActiveProviderType();

  if (cachedProvider && cachedProviderType === activeType) {
    return cachedProvider;
  }

  const providerFactory = providerRegistry.get(activeType);
  if (!providerFactory) {
    throw new Error(`No provider registered for type: ${activeType}`);
  }

  cachedProvider = providerFactory();
  cachedProviderType = activeType;
  return cachedProvider;
}

export function getProvider(type: MusicProviderType): MusicProvider {
  const providerFactory = providerRegistry.get(type);
  if (!providerFactory) {
    throw new Error(`No provider registered for type: ${type}`);
  }
  return providerFactory();
}

export function clearProviderCache(): void {
  cachedProvider = null;
  cachedProviderType = null;
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
registerProvider("youtube", createYouTubeProvider);
