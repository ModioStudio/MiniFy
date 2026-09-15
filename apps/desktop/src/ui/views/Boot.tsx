import { SpotifyLogo } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { writeSettings } from "../../lib/settingLib";

type BootStep = "provider" | "spotify-setup" | "connecting" | "complete";

type BootProps = {
  onComplete: () => void;
  initialStep?: BootStep;
  skipAuthCheck?: boolean;
};

const SPOTIFY_CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/i;
const DEFAULT_SPOTIFY_REDIRECT_URIS = [
  "http://127.0.0.1:3000/callback",
  "http://127.0.0.1:3001/callback",
  "http://127.0.0.1:3002/callback",
  "http://127.0.0.1:3003/callback",
  "http://127.0.0.1:3004/callback",
];

export default function Boot({
  onComplete,
  initialStep = "provider",
  skipAuthCheck = false,
}: BootProps) {
  const [step, setStep] = useState<BootStep>(initialStep);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redirectUris, setRedirectUris] = useState(DEFAULT_SPOTIFY_REDIRECT_URIS);
  const [copied, setCopied] = useState(false);

  // Fetch the exact redirect URIs from the backend so the setup instructions
  // always match what MiniFy actually sends to Spotify.
  useEffect(() => {
    invoke<string[]>("get_spotify_redirect_uris")
      .then((uris) => {
        if (uris.length > 0) setRedirectUris(uris);
      })
      .catch(() => {});
  }, []);

  const copyRedirectUris = async () => {
    try {
      await navigator.clipboard.writeText(redirectUris.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; the value is still visible to copy manually.
    }
  };

  const cancelConnecting = async () => {
    await invoke("cancel_oauth_flow").catch(() => {});
    setError(null);
    setStep("provider");
  };

  const checkExistingAuth = useCallback(async () => {
    if (skipAuthCheck) return;

    const hasValidTokens = await invoke<boolean>("has_valid_tokens");
    if (hasValidTokens) {
      onComplete();
    }
  }, [onComplete, skipAuthCheck]);

  useEffect(() => {
    checkExistingAuth();
  }, [checkExistingAuth]);

  // Auto-start OAuth if credentials are already configured
  useEffect(() => {
    const autoStartOAuth = async () => {
      if (initialStep === "spotify-setup") {
        const needsSetup = await invoke<boolean>("needs_spotify_setup");
        if (!needsSetup) {
          setStep("connecting");
          try {
            await invoke("start_oauth_flow");
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            setError(errorMsg);
            setStep("spotify-setup");
          }
        }
      }
    };
    autoStartOAuth();
  }, [initialStep]);

  useEffect(() => {
    const setupOAuthListener = async () => {
      const unlistenSpotifySuccess = await listen("oauth-success", async () => {
        await invoke("set_music_provider", { provider: "spotify" });
        await writeSettings({ active_music_provider: "spotify" });
        setStep("complete");
        setTimeout(() => onComplete(), 500);
      });

      const unlistenSpotifyFailed = await listen<{ error: string }>("oauth-failed", (event) => {
        console.error("Spotify OAuth failed:", event.payload);
        setError(event.payload?.error || "Authentication failed. Please try again.");
        setStep("provider");
      });

      return () => {
        unlistenSpotifySuccess();
        unlistenSpotifyFailed();
      };
    };

    const cleanup = setupOAuthListener();
    return () => {
      cleanup.then((c) => c());
    };
  }, [onComplete]);

  const handleSpotifySelect = async () => {
    setError(null);

    const needsSetup = await invoke<boolean>("needs_spotify_setup");
    if (needsSetup) {
      setStep("spotify-setup");
    } else {
      await startSpotifyAuth();
    }
  };

  const handleSpotifyClientIdSubmit = async () => {
    if (!SPOTIFY_CLIENT_ID_PATTERN.test(clientId.trim())) {
      setError("Please enter the 32-character Client ID from your Spotify Developer Dashboard");
      return;
    }

    setError(null);
    try {
      await invoke("save_spotify_client_id", { clientId: clientId.trim() });
      await startSpotifyAuth();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(`Failed to save Client ID: ${errorMsg}`);
    }
  };

  const startSpotifyAuth = async () => {
    setStep("connecting");
    setError(null);

    try {
      await invoke("start_oauth_flow");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      setStep("provider");
    }
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 text-white bg-black/60 backdrop-blur-md">
      {step === "provider" && (
        <div className="flex flex-col items-center gap-6 animate-fadeIn max-w-md w-full">
          <div className="text-center">
            <h1 className="font-circular text-2xl font-bold mb-2">Connect Spotify</h1>
            <p className="text-sm text-white/60">
              MiniFy is a Spotify client. Sign in to control playback.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSpotifySelect}
            className="flex items-center gap-4 p-4 rounded-xl border border-white/10 hover:border-white/30 hover:bg-white/5 cursor-pointer active:scale-[0.98] transition-all duration-200 w-full"
          >
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#1DB954" }}
            >
              <SpotifyLogo size={28} weight="fill" color="#000" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium">Spotify</div>
              <div className="text-xs text-white/40">Music provider</div>
            </div>
            <div className="text-white/40">→</div>
          </button>

          {error && (
            <div className="text-red-400 text-sm text-center bg-red-500/10 px-4 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>
      )}

      {step === "spotify-setup" && (
        <div className="flex flex-col items-center gap-6 animate-fadeIn max-w-md w-full">
          <div className="text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "#1DB954" }}
            >
              <SpotifyLogo size={36} weight="fill" color="#000" />
            </div>
            <h1 className="font-circular text-xl font-bold mb-2">Spotify Setup</h1>
            <p className="text-sm text-white/60">Two quick steps and you're in</p>
          </div>

          <div className="w-full space-y-4">
            <ol className="space-y-3 text-sm text-white/70">
              <li className="flex gap-3">
                <span className="flex-none w-5 h-5 rounded-full bg-[#1DB954]/20 text-[#1DB954] text-xs font-bold flex items-center justify-center mt-0.5">
                  1
                </span>
                <span>
                  Open the{" "}
                  <a
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1DB954] hover:underline"
                  >
                    Spotify Developer Dashboard
                  </a>{" "}
                  and create an app (any name).
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex-none w-5 h-5 rounded-full bg-[#1DB954]/20 text-[#1DB954] text-xs font-bold flex items-center justify-center mt-0.5">
                  2
                </span>
                <div className="flex-1">
                  <span>
                    In the app settings, add these exact{" "}
                    <span className="text-white">Redirect URIs</span> and save:
                  </span>
                  <div className="mt-2 flex items-start gap-2">
                    <div className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/90 font-mono space-y-1">
                      {redirectUris.map((uri) => (
                        <code key={uri} className="block truncate">
                          {uri}
                        </code>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={copyRedirectUris}
                      className="flex-none px-3 py-2 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/10 transition-colors"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-white/40">
                    Add all of them. MiniFy uses the first free port, so old login attempts cannot
                    block Spotify auth.
                  </p>
                </div>
              </li>
            </ol>

            <div className="pt-1">
              <label htmlFor="spotify-client-id" className="block text-xs text-white/50 mb-1.5">
                Then paste your <span className="text-white/80">Client ID</span> (from the app's
                settings page)
              </label>
              <input
                id="spotify-client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSpotifyClientIdSubmit()}
                placeholder="e.g. 4f8b2c1a9d3e4f5a6b7c8d9e0f1a2b3c"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#1DB954]/50 transition-colors font-mono text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handleSpotifyClientIdSubmit}
              className="w-full py-3 rounded-xl font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: "#1DB954", color: "#000" }}
            >
              Connect to Spotify
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("provider");
                setError(null);
                setClientId("");
              }}
              className="w-full py-2 text-white/50 hover:text-white/70 text-sm transition-colors"
            >
              ← Back
            </button>
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center bg-red-500/10 px-4 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>
      )}

      {step === "connecting" && (
        <div className="flex flex-col items-center gap-6 animate-fadeIn">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center animate-pulse"
            style={{ backgroundColor: "#1DB954" }}
          >
            <SpotifyLogo size={44} weight="fill" color="#000" />
          </div>
          <div className="text-center">
            <h1 className="font-circular text-xl font-bold mb-2">Connecting to Spotify</h1>
            <p className="text-sm text-white/60">Please complete the login in your browser</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full bg-white/50 animate-bounce"
              style={{ animationDelay: "0s" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-white/50 animate-bounce"
              style={{ animationDelay: "0.15s" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-white/50 animate-bounce"
              style={{ animationDelay: "0.3s" }}
            />
          </div>
          <button
            type="button"
            onClick={cancelConnecting}
            className="mt-2 py-2 px-4 text-white/50 hover:text-white/80 text-sm transition-colors"
          >
            Cancel
          </button>
          <p className="text-xs text-white/30 text-center max-w-xs">
            Seeing a "redirect_uri not matching" error in your browser? Cancel and make sure the
            Redirect URI is added to your Spotify app.
          </p>
        </div>
      )}

      {step === "complete" && (
        <div className="flex flex-col items-center gap-4 animate-fadeIn">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "#1DB954" }}
          >
            <SpotifyLogo size={44} weight="fill" color="#000" />
          </div>
          <div className="text-center">
            <h1 className="font-circular text-xl font-bold mb-1">Connected!</h1>
            <p className="text-sm text-white/60">Starting MiniFy...</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
}
