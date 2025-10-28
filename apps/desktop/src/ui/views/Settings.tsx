import { ArrowLeft, GearSix, GithubLogo, ShieldCheck, SquaresFour } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { writeSettings } from "../settingLib";

type SettingsProps = {
  onBack: () => void;
  onUpdateLayout?: (layout: string) => void;
  onUpdateTheme?: (theme: string) => void;
};

const categories = [
  { key: "appearance", label: "Appearance", icon: GearSix },
  { key: "layout", label: "Layout", icon: SquaresFour },
  { key: "privacy", label: "Privacy", icon: ShieldCheck },
] as const;

export default function Settings({ onBack, onUpdateLayout, onUpdateTheme }: SettingsProps) {
  const [active, setActive] = useState<(typeof categories)[number]["key"]>("appearance");

  const applyLayout = async (layout: string) => {
    await writeSettings({ layout });
    onUpdateLayout?.(layout);
  };

  const applyTheme = async (theme: string) => {
    await writeSettings({ theme });
    onUpdateTheme?.(theme);
  };

  return (
    <div className="h-full w-full p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-semibold">Settings</h1>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="cursor-pointer text-white/90 hover:text-white rounded-full w-8 h-8 flex items-center justify-center active:scale-[0.98] focus:outline-none"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
      </div>

      <div className="h-[calc(100%-40px)] w-full grid grid-cols-[160px_1fr] gap-3">
        <div className="bg-black/50 rounded-xl border border-white/10 overflow-auto text-sm">
          <ul className="py-2">
            {categories.map(({ key, label, icon: Icon }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setActive(key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 ${
                    active === key ? "bg-white/10" : ""
                  }`}
                >
                  <Icon size={16} weight="fill" />
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-black/50 rounded-xl border border-white/10 overflow-auto text-sm p-3">
          {active === "appearance" && (
            <div className="flex flex-col gap-2">
              <div className="font-medium mb-1">Theme</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "catppuccin", label: "Catpp." },
                  { key: "dark", label: "Dark" },
                  { key: "dracula", label: "Dracula" },
                  { key: "light", label: "Light" },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => applyTheme(t.key)}
                    className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 hover:bg-white/10"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active === "layout" && (
            <div className="flex flex-col gap-2">
              <div className="font-medium mb-1">Layout</div>
              <div className="grid grid-cols-3 gap-2">
                {["LayoutA", "LayoutB", "LayoutC"].map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => applyLayout(l)}
                    className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 hover:bg-white/10"
                  >
                    {l.replace("Layout", "Layout ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active === "privacy" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <GithubLogo size={18} weight="fill" />
                <button
                  type="button"
                  className="underline text-white/90 hover:text-white"
                  onClick={() => openUrl("https://github.com/J4ron/spotify-mini-player")}
                >
                  View source code
                </button>
              </div>
              <p className="text-white/70 leading-relaxed">
                This app runs locally. No personal data is collected, sent, or processed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
