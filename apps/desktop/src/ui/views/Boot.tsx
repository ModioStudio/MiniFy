import { SpotifyLogo } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { type SpotifyTokens, readSettings, writeSettings } from "../../lib/settingLib";
import { Button } from "../components/Button";

type BootProps = {
  onComplete: (layout: string, theme: string, spotifyTokens: SpotifyTokens) => void;
};

export default function Boot({ onComplete }: BootProps) {
  const [step, setStep] = useState(0);
  const [layout, setLayout] = useState("LayoutA");
  const [theme, setTheme] = useState("light");
  const [clientId, setClientId] = useState("");
  const [spotifyTokens, setSpotifyTokens] = useState<SpotifyTokens>({
    access_token: null,
    refresh_token: null,
  });

  useEffect(() => {
    const init = async () => {
      const hasClientId = await invoke<boolean>("has_client_id");
      const hasValidTokens = await invoke<boolean>("has_valid_tokens");

      const settings = await readSettings();
      setLayout(settings.layout);
      setTheme(settings.theme);

      if (!hasClientId) {
        setStep(-1);
      } else if (!hasValidTokens) {
        setStep(0);
      } else if (settings.first_boot_done) {
        const tokens = await invoke<{ access_token: string; refresh_token: string }>("get_tokens");
        setSpotifyTokens({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        setStep(3);
      } else {
        setStep(0);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const setupOAuthListener = async () => {
      const unlistenSuccess = await listen("oauth-success", async () => {
        try {
          const tokens = await invoke<{ access_token: string; refresh_token: string }>(
            "get_tokens"
          );
          setSpotifyTokens({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          });
        } catch (e) {
          console.error(e);
        }
        setStep(2);
      });
      const unlistenFailed = await listen("oauth-failed", (payload) => {
        console.error("OAuth failed", payload);
        setStep(0);
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
  }, []);

  const saveClientId = async () => {
    if (clientId.trim().length < 10) return;
    await invoke("save_client_id", { clientId });
    // Immediately start OAuth after saving client id
    try {
      await invoke("start_oauth_flow");
      setStep(1);
    } catch (e) {
      console.error(e);
    }
  };

  const connectSpotify = async () => {
    await invoke("start_oauth_flow");
    setStep(1);
  };

  const handleLayoutSelect = async (newLayout: string) => {
    setLayout(newLayout);
    await writeSettings({ layout: newLayout });
  };

  const handleThemeSelect = async (newTheme: string) => {
    setTheme(newTheme);
    await writeSettings({ theme: newTheme });
  };

  const finishSetup = async () => {
    await writeSettings({
      first_boot_done: true,
      layout,
      theme,
      // Do not persist tokens in settings; stored in keyring only
      spotify: { access_token: null, refresh_token: null },
    });
    onComplete(layout, theme, spotifyTokens);
    setStep(4);
  };

  return (
    <div className="p-4 flex flex-col gap-4 text-[#FBFBFB] h-full w-full">
      {step === -1 && (
        <div className="flex flex-col gap-4 mt-6">
          <h1 className="text-2xl mb-2 text-center">Enter Spotify Client ID</h1>
          <p className="text-sm text-gray-400 text-center mb-2">
            Get your Client ID from the Spotify Developer Dashboard
          </p>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                await saveClientId();
              }
            }}
            placeholder="Enter your Client ID"
            className="bg-black/70 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-green-600"
          />
          <Button onClick={saveClientId} className="bg-green-600 hover:bg-green-700">
            Save
          </Button>
        </div>
      )}

      {step === 0 && (
        <div className="flex flex-col gap-2 mt-6">
          <h1 className="text-2xl mb-4 text-center">Connect with Spotify</h1>
          <Button
            onClick={connectSpotify}
            className="flex justify-center hover:bg-green-600 bg-black/70 hover:cursor-pointer"
          >
            <SpotifyLogo size={32} weight="fill" />
          </Button>
        </div>
      )}

      {step === 1 && (
        <h1 className="text-xl font-bold mb-4">Waiting for Spotify authorization...</h1>
      )}

      {step === 2 && (
        <div>
          <h1 className="text-xl font-bold mb-4">Select Layout</h1>
          <div className="flex gap-2 mb-4">
            <Button
              onClick={() => handleLayoutSelect("LayoutA")}
              className={layout === "LayoutA" ? "bg-green-600" : ""}
            >
              Layout A
            </Button>
            <Button
              onClick={() => handleLayoutSelect("LayoutB")}
              className={layout === "LayoutB" ? "bg-green-600" : ""}
            >
              Layout B
            </Button>
            <Button
              onClick={() => handleLayoutSelect("LayoutC")}
              className={layout === "LayoutC" ? "bg-green-600" : ""}
            >
              Layout C
            </Button>
          </div>
          <Button onClick={() => setStep(3)}>Next</Button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h1 className="text-xl font-bold mb-4">Select Theme</h1>
          <div className="flex gap-2 mb-4">
            <Button
              onClick={() => handleThemeSelect("light")}
              className={theme === "light" ? "bg-green-600" : ""}
            >
              Light
            </Button>
            <Button
              onClick={() => handleThemeSelect("dark")}
              className={theme === "dark" ? "bg-green-600" : ""}
            >
              Dark
            </Button>
          </div>
          <Button onClick={finishSetup}>Finish</Button>
        </div>
      )}
    </div>
  );
}
