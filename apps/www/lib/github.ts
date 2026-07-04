"use client";

import { useEffect, useState } from "react";

export const GITHUB_REPO = "ModioStudio/MiniFy";
export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GithubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
}

/** Fetches the latest published (non-draft, non-prerelease) release from GitHub. */
export async function fetchLatestRelease(signal?: AbortSignal): Promise<GithubRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as GithubRelease;
  } catch {
    return null;
  }
}

/** Human-readable format label for a release asset, derived from its file name. */
export function assetFormatLabel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith("-setup.exe")) return "EXE (Setup)";
  if (lower.endsWith(".exe")) return "EXE";
  if (lower.endsWith(".msi")) return "MSI";
  if (lower.endsWith(".dmg")) return "DMG";
  if (lower.endsWith(".deb")) return "DEB";
  if (lower.endsWith(".appimage")) return "AppImage";
  if (lower.endsWith(".rpm")) return "RPM";
  if (lower.endsWith(".flatpak")) return "Flatpak";
  const ext = name.split(".").pop();
  return ext ? ext.toUpperCase() : name;
}

/** Finds the first asset whose (case-insensitive) name matches every predicate. */
function matchAsset(
  assets: ReleaseAsset[],
  predicate: (name: string) => boolean
): ReleaseAsset | undefined {
  return assets.find((a) => !a.name.endsWith(".sig") && predicate(a.name.toLowerCase()));
}

export interface PlatformAssets {
  /** The primary, recommended installer for the platform. */
  primary?: ReleaseAsset;
  /** Additional formats offered as secondary downloads. */
  extras: { label: string; asset: ReleaseAsset }[];
}

/** Resolves the download assets for each supported platform from a release. */
export function resolvePlatformAssets(release: GithubRelease | null) {
  const assets = release?.assets ?? [];

  const exe =
    matchAsset(assets, (n) => n.endsWith("-setup.exe")) ??
    matchAsset(assets, (n) => n.endsWith(".exe"));
  const msi = matchAsset(assets, (n) => n.endsWith(".msi"));

  const dmg = matchAsset(assets, (n) => n.endsWith(".dmg"));

  const deb = matchAsset(assets, (n) => n.endsWith(".deb"));
  const appimage = matchAsset(assets, (n) => n.endsWith(".appimage"));
  const rpm = matchAsset(assets, (n) => n.endsWith(".rpm"));
  const flatpak = matchAsset(assets, (n) => n.endsWith(".flatpak"));

  const windows: PlatformAssets = {
    primary: exe,
    extras: msi ? [{ label: "MSI", asset: msi }] : [],
  };

  const macos: PlatformAssets = {
    primary: dmg,
    extras: [],
  };

  const linux: PlatformAssets = {
    primary: deb ?? appimage,
    extras: [
      appimage && appimage !== (deb ?? appimage) ? { label: "AppImage", asset: appimage } : null,
      rpm ? { label: "RPM", asset: rpm } : null,
      flatpak ? { label: "Flatpak", asset: flatpak } : null,
    ].filter((x): x is { label: string; asset: ReleaseAsset } => x !== null),
  };

  return { windows, macos, linux };
}

export interface UseLatestRelease {
  release: GithubRelease | null;
  loading: boolean;
  /** Release tag without a leading "v", e.g. "0.6.0". Empty while loading. */
  version: string;
}

/** Client hook that loads the latest GitHub release once on mount. */
export function useLatestRelease(): UseLatestRelease {
  const [release, setRelease] = useState<GithubRelease | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchLatestRelease(controller.signal).then((r) => {
      setRelease(r);
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const version = release?.tag_name?.replace(/^v/, "") ?? "";

  return { release, loading, version };
}
