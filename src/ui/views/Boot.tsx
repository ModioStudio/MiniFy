import { useState, useEffect } from "react";
import { Button } from "../components/Button";
import { SpotifyLogo } from "@phosphor-icons/react";
import { readSettings } from "../settingLib";
import { openUrl } from "@tauri-apps/plugin-opener";

type SpotifyTokens = { accessToken: string | null; refreshToken: string | null; };
type BootProps = { onComplete: (layout: string, theme: string, spotifyTokens: SpotifyTokens) => void; };

export default function Boot({ onComplete }: BootProps) {
  const [step, setStep] = useState(0);
  const [layout, setLayout] = useState("LayoutA");
  const [theme, setTheme] = useState("light");
  const [spotifyTokens, setSpotifyTokens] = useState<SpotifyTokens>({ accessToken: null, refreshToken: null });


  useEffect(() => {
    const init = async () => {
      const settings = await readSettings();
      if (settings.firstBootDone && settings.spotify?.accessToken && settings.spotify?.refreshToken) {
        setSpotifyTokens({
          accessToken: settings.spotify.accessToken,
          refreshToken: settings.spotify.refreshToken
        });
        setLayout(settings.layout || "LayoutA");
        setTheme(settings.theme || "light");
        setStep(3);
      }
    };
    init();
  }, []);

useEffect(() => {
  let polling = true;

  const pollTokens = async () => {
    if (!polling) return;
    try {
      const res = await fetch("http://127.0.0.1:3000/tokens");
      console.log("Polling /tokens, response status:", res.status);
      if (res.ok) {
        const tokens = await res.json();
        setSpotifyTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
        console.log("Login erfolgreich, weiter zu Layout-Auswahl.");
        setStep(1); 
      } else {
        setTimeout(pollTokens, 1000); 
      }
    } catch {
      setTimeout(pollTokens, 1000);
    }
  };

  if (step === 0) pollTokens();

  return () => { polling = false; };
}, [step]);


  const connectSpotify = async () => {
    await openUrl("http://127.0.0.1:3000/login");
  };

  if (step === 3) {
    // Boot Sequence komplett abgeschlossen → direkt App starten
    onComplete(layout, theme, spotifyTokens);
    return null;
  }

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
      {step === 1 && (
        <div>
          <h1 className="text-xl font-bold mb-4">Select Layout</h1>
          <div className="flex gap-2 mb-4">
            <Button onClick={() => setLayout("LayoutA")}>Layout A</Button>
            <Button onClick={() => setLayout("LayoutB")}>Layout B</Button>
            <Button onClick={() => setLayout("LayoutC")}>Layout C</Button>
          </div>
          <Button onClick={() => setStep(2)}>Next</Button>
        </div>
      )}
      {step === 2 && (
        <div>
          <h1 className="text-xl font-bold mb-4">Select Theme</h1>
          <div className="flex gap-2 mb-4">
            <Button onClick={() => setTheme("light")}>Light</Button>
            <Button onClick={() => setTheme("dark")}>Dark</Button>
          </div>
          <Button onClick={() => setStep(3)}>Finish</Button>
        </div>
      )}
    </div>
  );
}
