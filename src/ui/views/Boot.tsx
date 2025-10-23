import { useState, useEffect } from "react";
import { Button } from "../components/Button";
import { SpotifyLogo } from "@phosphor-icons/react";
import { readSettings, writeSettings, SpotifyTokens } from "../settingLib";
import { openUrl } from "@tauri-apps/plugin-opener";

type BootProps = {
  onComplete: (layout: string, theme: string, spotifyTokens: SpotifyTokens) => void;
};

export default function Boot({ onComplete }: BootProps) {
  const [step, setStep] = useState(0);
  const [layout, setLayout] = useState("LayoutA");
  const [theme, setTheme] = useState("light");
  const [spotifyTokens, setSpotifyTokens] = useState<SpotifyTokens>({ access_token: null, refresh_token: null });

  useEffect(() => {
    const init = async () => {
      const settings = await readSettings();
      setLayout(settings.layout);
      setTheme(settings.theme);
      if (settings.first_boot_done && settings.spotify.access_token && settings.spotify.refresh_token) {
        setSpotifyTokens({
          access_token: settings.spotify.access_token,
          refresh_token: settings.spotify.refresh_token,
        });
        setStep(3);
      }
    };
    init();
  }, []);

  const connectSpotify = async () => {
    await openUrl("http://127.0.0.1:3000/login");
    setStep(1);
  };

  useEffect(() => {
    if (step !== 1) return;
    let polling = true;

    const pollTokens = async () => {
      if (!polling) return;
      try {
        const res = await fetch("http://127.0.0.1:3000/tokens");
        if (res.ok) {
          const tokens = await res.json();
          setSpotifyTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
          setStep(2);
        } else {
          setTimeout(pollTokens, 1000);
        }
      } catch {
        setTimeout(pollTokens, 1000);
      }
    };

    pollTokens();
    return () => { polling = false; };
  }, [step]);

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
      spotify: spotifyTokens
    });
    onComplete(layout, theme, spotifyTokens);
    setStep(4);
  };

  return (
    <div className="p-4 flex flex-col gap-4 text-[#FBFBFB] h-full w-full">
      {step === 0 && (
        <div className="flex flex-col gap-2 mt-6">
          <h1 className="text-2xl mb-4 text-center">Connect with Spotify</h1>
          <Button onClick={connectSpotify} className="flex justify-center hover:bg-green-600 bg-black/70 hover:cursor-pointer">
            <SpotifyLogo size={32} weight="fill" />
          </Button>
        </div>
      )}

      {step === 1 && <h1 className="text-xl font-bold mb-4">Waiting for Spotify tokens...</h1>}

      {step === 2 && (
        <div>
          <h1 className="text-xl font-bold mb-4">Select Layout</h1>
          <div className="flex gap-2 mb-4">
            <Button onClick={() => handleLayoutSelect("LayoutA")} className={layout === "LayoutA" ? "bg-green-600" : ""}>Layout A</Button>
            <Button onClick={() => handleLayoutSelect("LayoutB")} className={layout === "LayoutB" ? "bg-green-600" : ""}>Layout B</Button>
            <Button onClick={() => handleLayoutSelect("LayoutC")} className={layout === "LayoutC" ? "bg-green-600" : ""}>Layout C</Button>
          </div>
          <Button onClick={() => setStep(3)}>Next</Button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h1 className="text-xl font-bold mb-4">Select Theme</h1>
          <div className="flex gap-2 mb-4">
            <Button onClick={() => handleThemeSelect("light")} className={theme === "light" ? "bg-green-600" : ""}>Light</Button>
            <Button onClick={() => handleThemeSelect("dark")} className={theme === "dark" ? "bg-green-600" : ""}>Dark</Button>
          </div>
          <Button onClick={finishSetup}>Finish</Button>
        </div>
      )}
    </div>
  );
}
