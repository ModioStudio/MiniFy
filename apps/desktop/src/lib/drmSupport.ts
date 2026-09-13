import { logDiagnostic } from "./diagnostics";

/**
 * Spotify's Web Playback SDK streams Widevine-encrypted audio. If the embedded
 * webview has no Widevine CDM, the SDK still connects and registers a Connect
 * device, and playback still starts — Spotify ships a few seconds of clear lead
 * before the encrypted part — but audio dies as soon as the first license
 * request is needed. That failure mode looks like "music stops after ~10s", so
 * probe for the CDM up front and report it instead of guessing later.
 */

export type DrmProbeResult = {
  widevine: boolean;
  playready: boolean;
  clearkey: boolean;
  secureContext: boolean;
  detail: string;
};

const AUDIO_CONFIG: MediaKeySystemConfiguration[] = [
  {
    initDataTypes: ["cenc"],
    audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }],
  },
];

let cached: Promise<DrmProbeResult> | null = null;

async function probeKeySystem(keySystem: string): Promise<{ ok: boolean; detail: string }> {
  if (typeof navigator.requestMediaKeySystemAccess !== "function") {
    return { ok: false, detail: `${keySystem}: EME unavailable` };
  }
  try {
    const access = await navigator.requestMediaKeySystemAccess(keySystem, AUDIO_CONFIG);
    // requestMediaKeySystemAccess can resolve while the CDM itself is missing;
    // createMediaKeys is what actually instantiates it.
    await access.createMediaKeys();
    return { ok: true, detail: `${keySystem}: ok` };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `${keySystem}: ${name} ${message}` };
  }
}

export function probeDrmSupport(): Promise<DrmProbeResult> {
  if (cached) return cached;

  cached = (async () => {
    const [widevine, playready, clearkey] = await Promise.all([
      probeKeySystem("com.widevine.alpha"),
      probeKeySystem("com.microsoft.playready.recommendation"),
      probeKeySystem("org.w3.clearkey"),
    ]);

    const result: DrmProbeResult = {
      widevine: widevine.ok,
      playready: playready.ok,
      clearkey: clearkey.ok,
      secureContext: window.isSecureContext,
      detail: [
        `secureContext=${window.isSecureContext}`,
        `origin=${window.location.origin}`,
        `ua=${navigator.userAgent}`,
        widevine.detail,
        playready.detail,
        clearkey.detail,
      ].join(" | "),
    };

    logDiagnostic("drm", result.detail);
    return result;
  })();

  return cached;
}
