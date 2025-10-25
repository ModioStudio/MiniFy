import { useEffect, useState } from "react";
import "./global.css";
import LayoutA from "./layouts/LayoutA";
import LayoutB from "./layouts/LayoutB";
import LayoutC from "./layouts/LayoutC";
import { readSettings, writeSettings } from "./settingLib";
import Boot from "./views/Boot";

export default function App() {
  const [firstBootDone, setFirstBootDone] = useState<boolean | null>(null);
  const [layout, setLayout] = useState<string>("LayoutA");
  const [theme, setTheme] = useState<string>("dark");

  useEffect(() => {
    async function loadSettings() {
      const settings = await readSettings();
      setFirstBootDone(settings.first_boot_done || false);
      setLayout(settings.layout || "LayoutA");
      setTheme(settings.theme || "dark");
    }
    loadSettings();
  }, []);

  if (firstBootDone === null) return <div>Loading...</div>;

  if (!firstBootDone)
    return (
      <Boot
        onComplete={async (selectedLayout, selectedTheme, spotifyTokens) => {
          await writeSettings({
            first_boot_done: true,
            layout: selectedLayout,
            theme: selectedTheme,
            spotify: spotifyTokens,
          });
          setLayout(selectedLayout);
          setTheme(selectedTheme);
          setFirstBootDone(true);
        }}
      />
    );

  switch (layout) {
    case "LayoutA":
      return <LayoutA />;
    case "LayoutB":
      return <LayoutB />;
    case "LayoutC":
      return <LayoutC />;
    default:
      return <LayoutA />;
  }
}
