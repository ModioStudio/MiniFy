import { AppleLogo, SpotifyLogo, YoutubeLogo } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { writeSettings } from "../../lib/settingLib";

type MusicProvider = "spotify" | "apple" | "youtube" | null;

type BootStep =
  | "provider"
  | "spotify-setup"
  | "youtube-setup"
  | "connecting"
  | "complete";

type BootProps = {
  onComplete: () => void;
  initialStep?: BootStep;
  skipAuthCheck?: boolean;
};

export default function Boot({ onComplete, initialStep = "provider", skipAuthCheck = false }: BootProps) {
  const [step, setStep] = useState<BootStep>(initialStep);
  const [selectedProvider, setSelectedProvider] = useState<MusicProvider>(() => {
    if (initialStep === "youtube-setup") return "youtube";
    if (initialStep === "spotify-setup") return "spotify";
    return null;
  });
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const checkExistingAuth = useCallback(async () => {
    if (skipAuthCheck) return;
    
    const hasProvider = await invoke<boolean>("has_music_provider");
    if (!hasProvider) return;

    const provider = await invoke<string>("get_music_provider").catch(() => "spotify");

    if (provider === "youtube") {
      const hasValidYouTubeTokens = await invoke<boolean>("has_valid_youtube_tokens");
      if (hasValidYouTubeTokens) {
        onComplete();
      }
    } else {
      const hasValidTokens = await invoke<boolean>("has_valid_tokens");
      if (hasValidTokens) {
        onComplete();
      }
    }
  }, [onComplete, skipAuthCheck]);

  useEffect(() => {
    checkExistingAuth();
  }, [checkExistingAuth]);

  // Auto-start OAuth if credentials are already configured
  useEffect(() => {
    const autoStartOAuth = async () => {
      if (initialStep === "youtube-setup") {
        const needsSetup = await invoke<boolean>("needs_youtube_setup");
        if (!needsSetup) {
          // Credentials exist, start OAuth directly
          setStep("connecting");
          try {
            await invoke("start_youtube_oauth_flow");
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            setError(errorMsg);
            setStep("youtube-setup");
          }
        }
      } else if (initialStep === "spotify-setup") {
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

      const unlistenYouTubeSuccess = await listen("youtube-oauth-success", async () => {
        await invoke("set_music_provider", { provider: "youtube" });
        await writeSettings({ active_music_provider: "youtube" });
        setStep("complete");
        setTimeout(() => onComplete(), 500);
      });

      const unlistenYouTubeFailed = await listen<{ error: string }>(
        "youtube-oauth-failed",
        (event) => {
          console.error("YouTube OAuth failed:", event.payload);
          setError(event.payload?.error || "Authentication failed. Please try again.");
          setStep("provider");
        }
      );

      return () => {
        unlistenSpotifySuccess();
        unlistenSpotifyFailed();
        unlistenYouTubeSuccess();
        unlistenYouTubeFailed();
      };
    };

    const cleanup = setupOAuthListener();
    return () => {
      cleanup.then((c) => c());
    };
  }, [onComplete]);

  const handleProviderSelect = async (provider: MusicProvider) => {
    if (provider === "apple") {
      setError("Apple Music is coming soon. Please choose another provider.");
      return;
    }

    setSelectedProvider(provider);
    setError(null);

    if (provider === "spotify") {
      const needsSetup = await invoke<boolean>("needs_spotify_setup");
      if (needsSetup) {
        setStep("spotify-setup");
      } else {
        await startSpotifyAuth();
      }
    } else if (provider === "youtube") {
      const needsSetup = await invoke<boolean>("needs_youtube_setup");
      if (needsSetup) {
        setStep("youtube-setup");
      } else {
        await startYouTubeAuth();
      }
    }
  };

  const handleSpotifyClientIdSubmit = async () => {
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

  const handleYouTubeCredentialsSubmit = async () => {
    if (clientId.trim().length < 20) {
      setError("Please enter a valid Google Client ID");
      return;
    }
    if (clientSecret.trim().length < 10) {
      setError("Please enter a valid Google Client Secret");
      return;
    }

    setError(null);
    try {
      await invoke("save_youtube_credentials", {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      await startYouTubeAuth();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(`Failed to save credentials: ${errorMsg}`);
    }
  };

  const startSpotifyAuth = async () => {
    setStep("connecting");
    setSelectedProvider("spotify");
    setError(null);

    try {
      await invoke("start_oauth_flow");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(errorMsg);
      setStep("provider");
    }
  };

  const startYouTubeAuth = async () => {
    setStep("connecting");
    setSelectedProvider("youtube");
    setError(null);

    try {
      await invoke("start_youtube_oauth_flow");
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
      iconColor: "#000",
      available: true,
    },
    {
      id: "youtube" as const,
      name: "YouTube Music",
      icon: YoutubeLogo,
      color: "#FF0000",
      iconColor: "#fff",
      available: true,
    },
    {
      id: "apple" as const,
      name: "Apple Music",
      icon: AppleLogo,
      color: "#FC3C44",
      iconColor: "#fff",
      available: false,
    },
  ];

  const getProviderConfig = (id: MusicProvider) => {
    return providers.find((p) => p.id === id) ?? providers[0];
  };

  const connectingProvider = getProviderConfig(selectedProvider);
  const ProviderIcon = connectingProvider.icon;

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
                  <provider.icon size={28} weight="fill" color={provider.iconColor} />
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
              onKeyDown={(e) => e.key === "Enter" && handleSpotifyClientIdSubmit()}
              placeholder="Enter your Spotify Client ID"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#1DB954]/50 transition-colors"
            />

            <button
              type="button"
              onClick={handleSpotifyClientIdSubmit}
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
                setClientId("");
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

      {step === "youtube-setup" && (
        <div className="flex flex-col items-center gap-6 animate-fadeIn max-w-md w-full">
          <div className="text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "#FF0000" }}
            >
              <YoutubeLogo size={36} weight="fill" color="#fff" />
            </div>
            <h1 className="font-circular text-xl font-bold mb-2">YouTube Music Setup</h1>
            <p className="text-sm text-white/60">
              Enter your Google Cloud OAuth credentials to continue
            </p>
          </div>

          <div className="w-full space-y-3">
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Enter your Google Client ID"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#FF0000]/50 transition-colors"
            />

            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleYouTubeCredentialsSubmit()}
              placeholder="Enter your Google Client Secret"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#FF0000]/50 transition-colors"
            />

            <button
              type="button"
              onClick={handleYouTubeCredentialsSubmit}
              className="w-full py-3 rounded-xl font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: "#FF0000", color: "#fff" }}
            >
              Continue
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("provider");
                setError(null);
                setClientId("");
                setClientSecret("");
              }}
              className="w-full py-2 text-white/50 hover:text-white/70 text-sm transition-colors"
            >
              ← Back
            </button>
          </div>

          <div className="text-xs text-white/40 text-center">
            <p>Get your credentials from the</p>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FF0000] hover:underline"
            >
              Google Cloud Console
            </a>
            <p className="mt-1">Enable YouTube Data API v3 and create OAuth 2.0 credentials</p>
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
            style={{ backgroundColor: connectingProvider.color }}
          >
            <ProviderIcon size={44} weight="fill" color={connectingProvider.iconColor} />
          </div>
          <div className="text-center">
            <h1 className="font-circular text-xl font-bold mb-2">
              Connecting to {connectingProvider.name}
            </h1>
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
            style={{ backgroundColor: connectingProvider.color }}
          >
            <ProviderIcon size={44} weight="fill" color={connectingProvider.iconColor} />
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
