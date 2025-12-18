import { ArrowLeft, GearSix, GithubLogo, ShieldCheck, SquaresFour } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import { writeSettings } from "../settingLib";

type SettingsProps = {
  onBack: () => void;
  onUpdateLayout?: (layout: string) => void;
  onUpdateTheme?: (theme: string) => void;
};

const { setLayout } = useWindowLayout();

const categories = [
  { key: "appearance", label: "Appearance", icon: GearSix },
  { key: "layout", label: "Layout", icon: SquaresFour },
  { key: "privacy", label: "Privacy", icon: ShieldCheck },
] as const;

const themeColors: Record<string, string> = {
  catppuccin: "#F5C2E7",
  dark: "#1E1E2E",
  dracula: "#6272A4",
  light: "#FFFFFF",
};

export default function Settings({ onBack, onUpdateLayout, onUpdateTheme }: SettingsProps) {
  const [active, setActive] = useState<(typeof categories)[number]["key"]>("appearance");
  const [currentTheme, setCurrentTheme] = useState<string>("dark"); // default, kann aus Settings kommen
  const [currentLayout, setCurrentLayout] = useState<string>("LayoutA");

  const applyLayout = async (layout: string) => {
    await writeSettings({ layout });
    setCurrentLayout(layout);
    onUpdateLayout?.(layout);
  };

  const applyTheme = async (theme: string) => {
    await writeSettings({ theme });
    setCurrentTheme(theme);
    onUpdateTheme?.(theme);
  };

  useEffect(() => {
    setLayout("Settings");
  }, []);

  return (
    <div className="h-full w-full p-4 text-white">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-semibold">Settings</h1>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="cursor-pointer text-white/90 hover:text-white rounded-full w-8 h-8 flex items-center justify-center active:scale-[0.95] transition-transform duration-150 focus:outline-none"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
      </div>

      <div className="h-[calc(100%-40px)] w-full grid grid-cols-[160px_1fr] gap-3">
        <div className="bg-black/50 rounded-xl border border-white/10 overflow-auto text-sm">
          <ul className="py-2">
            {categories.map(({ key, label, icon: Icon }) => (
              <li key={key} className="relative">
                <button
                  type="button"
                  onClick={() => setActive(key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-200 ${
                    active === key ? "bg-white/10" : "hover:bg-white/10"
                  }`}
                >
                  <Icon size={16} weight="fill" />
                  <span>{label}</span>
                </button>
                {active === key && (
                  <span className="absolute left-0 top-0 h-full w-1 bg-blue-500 rounded-r-full transition-all duration-200" />
                )}
              </li>
            ))}
          </ul>
        </div>

        <div
          key={active}
          className="bg-black/50 rounded-xl border border-white/10 overflow-auto text-sm p-4 transition-opacity duration-300 ease-in-out opacity-0 animate-fadeIn"
        >
          {active === "appearance" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Theme</div>
                <span className="text-white/70 text-xs">Current: {currentTheme}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                    className={`px-3 py-2 rounded-lg border border-white/10 flex items-center justify-center gap-2 hover:bg-white/10 hover:scale-105 active:scale-95 transition-transform duration-150 ${
                      currentTheme === t.key ? "bg-white/20" : "bg-black/80"
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/20"
                      style={{ backgroundColor: themeColors[t.key] }}
                    />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active === "layout" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Layout</div>
                <span className="text-white/70 text-xs">
                  Current: {currentLayout.replace("Layout", "Layout ")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["LayoutA", "LayoutB", "LayoutC"].map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => applyLayout(l)}
                    className={`px-3 py-2 rounded-lg border border-white/10 hover:bg-white/10 hover:scale-105 active:scale-95 transition-transform duration-150 ${
                      currentLayout === l ? "bg-white/20" : "bg-black/80"
                    }`}
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
                  onClick={() => openUrl("https://github.com/ModioStudio/MiniFy")}
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

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s forwards;
        }
      `}</style>
    </div>
  );
}
