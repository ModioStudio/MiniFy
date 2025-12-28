import { ArrowLeft, GearSix, GithubLogo, ShieldCheck, SquaresFour } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import { readSettings, writeSettings } from "../../lib/settingLib";

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

const themeColors: Record<string, string> = {
  catppuccin: "#F5C2E7",
  dark: "#1E1E2E",
  dracula: "#6272A4",
  light: "#FFFFFF",
  milka: "#C399FF",
  bmw: "#C52B30",
  youtube: "#FF0000",
  chatgpt: "#10A37F",
};

export default function Settings({ onBack, onUpdateLayout, onUpdateTheme }: SettingsProps) {
  const { setLayout } = useWindowLayout();
  const [active, setActive] = useState<(typeof categories)[number]["key"]>("appearance");
  const [currentTheme, setCurrentTheme] = useState<string>("dark");
  const [currentLayout, setCurrentLayout] = useState<string>("LayoutA");

  useEffect(() => {
    setLayout("Settings");

    (async () => {
      const settings = await readSettings();
      if (settings.theme) setCurrentTheme(settings.theme);
      if (settings.layout) setCurrentLayout(settings.layout);
    })();
  }, [setLayout]);

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

  return (
    <div className="h-full w-full p-4" style={{ color: "var(--settings-text)" }}>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-base font-semibold">Settings</h1>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          // Bug Report, DragArea grab cursor collision with Settings Nav (Urgent 2 fix)
          className="mt-3 rounded-full w-8 h-8 flex items-center justify-center active:scale-[0.95] transition-transform duration-150 hover:bg-[rgba(255,255,255,0.08)]"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
      </div>

      <div className="h-[calc(100%-40px)] w-full grid grid-cols-[160px_1fr] gap-3">
        {/* Sidebar */}
        <div
          className="rounded-xl border overflow-auto text-sm"
          style={{
            background: "var(--settings-panel-bg)",
            borderColor: "var(--settings-panel-border)",
            color: "var(--settings-text)",
          }}
        >
          <ul className="py-2">
            {categories.map(({ key, label, icon: Icon }) => (
              <li key={key} className="relative">
                <button
                  type="button"
                  onClick={() => setActive(key)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all duration-200 ease-in-out rounded-lg cursor-pointer hover:scale-[1.02] hover:bg-[--settings-item-hover] active:scale-[0.97]"
                  style={{
                    background: active === key ? "var(--settings-item-active)" : "transparent",
                  }}
                >
                  <Icon size={16} weight="fill" />
                  {label}
                </button>
                {active === key && (
                  <span className="absolute left-0 top-0 h-full w-1 bg-[--settings-accent] rounded-r-full transition-all duration-300" />
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Main Panel */}
        <div
          key={active}
          className="rounded-xl border overflow-auto text-sm p-4 transition-all duration-300 ease-in-out opacity-0 animate-fadeIn"
          style={{
            background: "var(--settings-panel-bg)",
            borderColor: "var(--settings-panel-border)",
            color: "var(--settings-text)",
          }}
        >
          {active === "appearance" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Theme</div>
                <span className="text-xs text-[--settings-text-muted]">
                  Current: {currentTheme}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  "catppuccin",
                  "dark",
                  "dracula",
                  "light",
                  "bmw",
                  "youtube",
                  "milka",
                  "chatgpt",
                ].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => applyTheme(t)}
                    className="px-3 py-2 rounded-lg border border-white/10 flex items-center justify-center gap-2 transition-all duration-200 ease-in-out cursor-pointer hover:scale-[1.03] active:scale-[0.97]"
                    style={{
                      background:
                        currentTheme === t
                          ? "var(--settings-item-active)"
                          : "var(--settings-panel-bg)",
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/20"
                      style={{ backgroundColor: themeColors[t] }}
                    />
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active === "layout" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Layout</div>
                <span className="text-xs text-[--settings-text-muted]">
                  Current: {currentLayout.replace("Layout", "Layout ")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["LayoutA", "LayoutB", "LayoutC"].map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => applyLayout(l)}
                    className="px-3 py-2 rounded-lg border border-white/10 transition-all duration-200 ease-in-out cursor-pointer hover:scale-[1.03] active:scale-[0.97]"
                    style={{
                      background:
                        currentLayout === l
                          ? "var(--settings-item-active)"
                          : "var(--settings-panel-bg)",
                    }}
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
                  className="underline text-[--settings-text] hover:text-[--settings-accent] transition-colors duration-200"
                  onClick={() => openUrl("https://github.com/ModioStudio/MiniFy")}
                >
                  View source code
                </button>
              </div>
              <p className="text-[settings-text-muted] leading-relaxed">
                This app runs locally. No personal data is collected, sent, or processed.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.25s forwards; }
      `}</style>
    </div>
  );
}
