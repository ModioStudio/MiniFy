import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  FloppyDisk,
  GearSix,
  GithubLogo,
  PaintBrush,
  ShieldCheck,
  SquaresFour,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import {
  CustomTheme,
  deleteCustomTheme,
  exportCustomTheme,
  loadCustomThemes,
  readSettings,
  saveCustomTheme,
  writeSettings,
} from "../../lib/settingLib";
import {
  applyCustomThemeFromJson,
  validateThemeJsonFormat,
} from "../../loader/themeLoader";

type SettingsProps = {
  onBack: () => void;
  onUpdateLayout?: (layout: string) => void;
  onUpdateTheme?: (theme: string) => void;
};

const categories = [
  { key: "appearance", label: "Appearance", icon: GearSix },
  { key: "layout", label: "Layout", icon: SquaresFour },
  { key: "themestudio", label: "Theme Studio", icon: PaintBrush },
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

const DEFAULT_THEME_JSON = `{
  "name": "my-custom-theme",
  "panel": {
    "background": "rgba(18, 18, 18, 0.85)",
    "borderRadius": 18,
    "shadow": "0 14px 36px rgba(0, 0, 0, 0.65)"
  },
  "settings": {
    "panelBg": "rgba(30, 30, 30, 0.55)",
    "panelBorder": "rgba(255, 255, 255, 0.10)",
    "text": "#FFFFFF",
    "textMuted": "rgba(200, 200, 200, 0.70)",
    "itemHover": "rgba(255, 255, 255, 0.08)",
    "itemActive": "rgba(255, 255, 255, 0.14)",
    "accent": "#74C7EC"
  },
  "controls": {
    "iconColor": "#E5E5E5",
    "iconColorActive": "#FFFFFF"
  },
  "playbar": {
    "trackBg": "rgba(255, 255, 255, 0.18)",
    "trackFill": "linear-gradient(90deg, #FFFFFF 0%, #CCCCCC 100%)",
    "thumbColor": "#FFFFFF",
    "timeTextColor": "rgba(255, 255, 255, 0.65)"
  },
  "typography": {
    "songTitle": { "color": "#FFFFFF", "weight": 600 },
    "songArtist": { "color": "rgba(255, 255, 255, 0.70)", "weight": 400 }
  },
  "actions": {
    "iconColor": "#FFFFFF",
    "iconBackground": "rgba(255, 255, 255, 0.06)",
    "iconBackgroundHover": "rgba(255, 255, 255, 0.14)"
  },
  "cover": {
    "borderColor": "rgba(255, 255, 255, 0.18)",
    "borderRadius": 12
  }
}`;

export default function Settings({ onBack, onUpdateLayout, onUpdateTheme }: SettingsProps) {
  const { setLayout } = useWindowLayout();
  const [active, setActive] = useState<(typeof categories)[number]["key"]>("appearance");
  const [currentTheme, setCurrentTheme] = useState<string>("dark");
  const [currentLayout, setCurrentLayout] = useState<string>("LayoutA");

  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [editorContent, setEditorContent] = useState<string>(DEFAULT_THEME_JSON);
  const [validationStatus, setValidationStatus] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const refreshCustomThemes = async () => {
    const themes = await loadCustomThemes();
    setCustomThemes(themes);
  };

  useEffect(() => {
    setLayout("Settings");

    (async () => {
      const settings = await readSettings();
      if (settings.theme) setCurrentTheme(settings.theme);
      if (settings.layout) setCurrentLayout(settings.layout);
      await refreshCustomThemes();
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

  const handleValidate = () => {
    const result = validateThemeJsonFormat(editorContent);
    setValidationStatus(result);
    setSaveStatus(null);
  };

  const handlePreview = () => {
    const result = applyCustomThemeFromJson(editorContent);
    setValidationStatus(result);
    if (!result.valid) {
      setSaveStatus(null);
    }
  };

  const handleSave = async () => {
    const validation = validateThemeJsonFormat(editorContent);
    setValidationStatus(validation);
    if (!validation.valid) {
      setSaveStatus(null);
      return;
    }

    try {
      await saveCustomTheme(editorContent);
      setSaveStatus("Theme saved successfully!");
      await refreshCustomThemes();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save theme";
      setSaveStatus(message);
    }
  };

  const handleExport = async (themeName: string) => {
    try {
      const json = await exportCustomTheme(themeName);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${themeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export theme:", err);
    }
  };

  const handleDeleteCustomTheme = async (themeName: string) => {
    try {
      await deleteCustomTheme(themeName);
      await refreshCustomThemes();
      if (currentTheme === `custom:${themeName}`) {
        await applyTheme("dark");
      }
    } catch (err) {
      console.error("Failed to delete theme:", err);
    }
  };

  const applyCustomTheme = async (theme: CustomTheme) => {
    const themeJson = JSON.stringify(theme);
    const result = applyCustomThemeFromJson(themeJson);
    if (result.valid) {
      const customThemeName = `custom:${theme.name}`;
      await writeSettings({ theme: customThemeName });
      setCurrentTheme(customThemeName);
      onUpdateTheme?.(customThemeName);
    }
  };

  const loadThemeIntoEditor = async (themeName: string) => {
    try {
      const json = await exportCustomTheme(themeName);
      setEditorContent(json);
      setValidationStatus(null);
      setSaveStatus(null);
    } catch (err) {
      console.error("Failed to load theme:", err);
    }
  };

  return (
    <div className="h-full w-full p-4" style={{ color: "var(--settings-text)" }}>
      <div className="flex items-center justify-between mb-3" style={{ color: "var(--settings-header-text)" }}>
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
                <div className="font-medium">Built-in Themes</div>
                <span className="text-xs text-[--settings-text-muted]">
                  Current: {currentTheme.startsWith("custom:") ? currentTheme.replace("custom:", "") : currentTheme}
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

              {customThemes.length > 0 && (
                <>
                  <div className="border-t border-white/10 my-2" />
                  <div className="font-medium">Custom Themes</div>
                  <div className="flex flex-col gap-2">
                    {customThemes.map((theme) => (
                      <div
                        key={theme.name}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/10"
                        style={{
                          background:
                            currentTheme === `custom:${theme.name}`
                              ? "var(--settings-item-active)"
                              : "var(--settings-panel-bg)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => applyCustomTheme(theme)}
                          className="flex items-center gap-2 flex-1 text-left cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <PaintBrush size={14} weight="fill" />
                          <span>{theme.name}</span>
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleExport(theme.name)}
                            className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
                            title="Export"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomTheme(theme.name)}
                            className="p-1 rounded hover:bg-red-500/30 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
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

          {active === "themestudio" && (
            <div className="flex flex-col gap-4 h-full">
              <div className="flex items-center justify-between">
                <div className="font-medium">Theme Editor</div>
                {validationStatus && (
                  <span
                    className="flex items-center gap-1 text-xs"
                    style={{
                      color: validationStatus.valid ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {validationStatus.valid ? (
                      <>
                        <Check size={12} weight="bold" /> Valid
                      </>
                    ) : (
                      <>
                        <Warning size={12} weight="fill" /> {validationStatus.error}
                      </>
                    )}
                  </span>
                )}
              </div>

              <textarea
                value={editorContent}
                onChange={(e) => {
                  setEditorContent(e.target.value);
                  setValidationStatus(null);
                  setSaveStatus(null);
                }}
                className="flex-1 min-h-[200px] p-3 rounded-lg border border-white/10 bg-black/30 text-xs font-mono resize-none focus:outline-none focus:border-[--settings-accent]"
                style={{
                  color: "var(--settings-text)",
                }}
                spellCheck={false}
              />

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleValidate}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors cursor-pointer text-xs"
                  >
                    <Check size={12} />
                    Validate
                  </button>
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors cursor-pointer text-xs"
                  >
                    <Eye size={12} />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[--settings-accent] bg-[--settings-accent]/20 hover:bg-[--settings-accent]/30 transition-colors cursor-pointer text-xs"
                  >
                    <FloppyDisk size={12} />
                    Save
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditorContent(DEFAULT_THEME_JSON);
                    setValidationStatus(null);
                    setSaveStatus(null);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors cursor-pointer text-xs"
                >
                  <X size={12} />
                  Reset
                </button>
              </div>

              {saveStatus && (
                <div
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    background: saveStatus.includes("success")
                      ? "rgba(34, 197, 94, 0.2)"
                      : "rgba(239, 68, 68, 0.2)",
                    color: saveStatus.includes("success") ? "#22c55e" : "#ef4444",
                  }}
                >
                  {saveStatus}
                </div>
              )}

              {customThemes.length > 0 && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <div className="text-xs text-[--settings-text-muted]">
                    Saved Themes (click to edit):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customThemes.map((theme) => (
                      <button
                        key={theme.name}
                        type="button"
                        onClick={() => loadThemeIntoEditor(theme.name)}
                        className="px-2 py-1 rounded border border-white/10 text-xs hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        {theme.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
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
