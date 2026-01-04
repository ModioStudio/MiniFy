import { AppleLogo, SpotifyLogo, YoutubeLogo } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

type MusicProvider = "spotify" | "apple" | "youtube" | null;

type BootStep = "provider" | "spotify-setup" | "connecting" | "complete";

type BootProps = {
  onComplete: () => void;
  initialStep?: BootStep;
};

export default function Boot({ onComplete, initialStep = "provider" }: BootProps) {
  const [step, setStep] = useState<BootStep>(initialStep);
  const [selectedProvider, setSelectedProvider] = useState<MusicProvider>(null);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const checkExistingAuth = useCallback(async () => {
    const hasProvider = await invoke<boolean>("has_music_provider");
    const hasValidTokens = await invoke<boolean>("has_valid_tokens");

    if (hasProvider && hasValidTokens) {
      onComplete();
    }
  }, [onComplete]);

  useEffect(() => {
    checkExistingAuth();
  }, [checkExistingAuth]);

  useEffect(() => {
    const setupOAuthListener = async () => {
      const unlistenSuccess = await listen("oauth-success", async () => {
        await invoke("set_music_provider", { provider: "spotify" });
        setStep("complete");
        setTimeout(() => onComplete(), 500);
      });

      const unlistenFailed = await listen<{ error: string }>("oauth-failed", (event) => {
        console.error("OAuth failed:", event.payload);
        setError(event.payload?.error || "Authentication failed. Please try again.");
        setStep("provider");
      });

      return () => {
        unlistenSuccess();
        unlistenFailed();
      };
    };

    const cleanup = setupOAuthListener();
    return () => {
      cleanup.then((c) => c());
    };
  }, [onComplete]);

  const handleProviderSelect = async (provider: MusicProvider) => {
    if (provider !== "spotify") {
      setError("This provider is not yet available. Please choose Spotify.");
      return;
    }

    setSelectedProvider(provider);
    setError(null);

    const needsSetup = await invoke<boolean>("needs_spotify_setup");
    if (needsSetup) {
      setStep("spotify-setup");
    } else {
      await startSpotifyAuth();
    }
  };

  const handleClientIdSubmit = async () => {
    if (clientId.trim().length < 20) {
      setError("Please enter a valid Spotify Client ID");
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

  const providers = [
    {
      id: "spotify" as const,
      name: "Spotify",
      icon: SpotifyLogo,
      color: "#1DB954",
      available: true,
    },
    {
      id: "apple" as const,
      name: "Apple Music",
      icon: AppleLogo,
      color: "#FC3C44",
      available: false,
    },
    {
      id: "youtube" as const,
      name: "YouTube Music",
      icon: YoutubeLogo,
      color: "#FF0000",
      available: false,
    },
  ];

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 text-white bg-black/60 backdrop-blur-md">
      {step === "provider" && (
        <div className="flex flex-col items-center gap-6 animate-fadeIn max-w-md w-full">
          <div className="text-center">
            <h1 className="font-circular text-2xl font-bold mb-2">Choose Music Provider</h1>
            <p className="text-sm text-white/60">Select your preferred music streaming service</p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleProviderSelect(provider.id)}
                disabled={!provider.available}
                className={`
                  flex items-center gap-4 p-4 rounded-xl border transition-all duration-200
                  ${
                    provider.available
                      ? "border-white/10 hover:border-white/30 hover:bg-white/5 cursor-pointer active:scale-[0.98]"
                      : "border-white/5 opacity-40 cursor-not-allowed"
                  }
                  ${selectedProvider === provider.id ? "border-white/30 bg-white/10" : ""}
                `}
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: provider.color }}
                >
                  <provider.icon size={28} weight="fill" color="#000" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium">{provider.name}</div>
                  {!provider.available && <div className="text-xs text-white/40">Coming soon</div>}
                </div>
                {provider.available && <div className="text-white/40">→</div>}
              </button>
            ))}
          </div>

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
            <p className="text-sm text-white/60">
              Enter your Spotify Developer Client ID to continue
            </p>
          </div>

          <div className="w-full space-y-3">
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClientIdSubmit()}
              placeholder="Enter your Spotify Client ID"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#1DB954]/50 transition-colors"
            />

            <button
              type="button"
              onClick={handleClientIdSubmit}
              className="w-full py-3 rounded-xl font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: "#1DB954", color: "#000" }}
            >
              Continue
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("provider");
                setError(null);
              }}
              className="w-full py-2 text-white/50 hover:text-white/70 text-sm transition-colors"
            >
              ← Back
            </button>
          </div>

          <div className="text-xs text-white/40 text-center">
            <p>Get your Client ID from the</p>
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1DB954] hover:underline"
            >
              Spotify Developer Dashboard
            </a>
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
