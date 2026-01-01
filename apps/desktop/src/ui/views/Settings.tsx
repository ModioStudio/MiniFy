import {
  AppleLogo,
  ArrowLeft,
  Brain,
  Check,
  CircleNotch,
  Download,
  Eye,
  FloppyDisk,
  GearSix,
  GithubLogo,
  Link,
  MusicNote,
  PaintBrush,
  ShieldCheck,
  SignOut,
  SpotifyLogo,
  SquaresFour,
  Trash,
  Warning,
  X,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import {
  type AIProviderConfig,
  type AIProviderType,
  type CustomTheme,
  type MusicProviderType,
  deleteAIApiKey,
  deleteCustomTheme,
  exportCustomTheme,
  hasAIApiKey,
  loadCustomThemes,
  readSettings,
  saveAIApiKey,
  saveCustomTheme,
  writeSettings,
} from "../../lib/settingLib";
import { applyCustomThemeFromJson, validateThemeJsonFormat } from "../../loader/themeLoader";

const AI_PROVIDERS: { id: AIProviderType; name: string; model: string; color: string }[] = [
  { id: "openai", name: "OpenAI", model: "GPT-4o Mini", color: "#10A37F" },
  { id: "anthropic", name: "Anthropic", model: "Claude 3 Haiku", color: "#D97757" },
  { id: "google", name: "Google AI", model: "Gemini 1.5 Flash", color: "#4285F4" },
  { id: "groq", name: "Groq", model: "Llama 3.1 8B", color: "#F55036" },
];

const MUSIC_PROVIDERS: {
  id: MusicProviderType;
  name: string;
  color: string;
  available: boolean;
}[] = [
  { id: "spotify", name: "Spotify", color: "#1DB954", available: true },
  { id: "apple", name: "Apple Music", color: "#FC3C44", available: false },
  { id: "youtube", name: "YouTube Music", color: "#FF0000", available: false },
];

async function validateAIApiKey(provider: AIProviderType, apiKey: string): Promise<boolean> {
  try {
    switch (provider) {
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return res.ok;
      }
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        return res.ok || res.status === 400;
      }
      case "google": {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
        );
        return res.ok;
      }
      case "groq": {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return res.ok;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

type SettingsProps = {
  onBack: () => void;
  onUpdateLayout?: (layout: string) => void;
  onUpdateTheme?: (theme: string) => void;
  onResetAuth?: () => void;
};

const categories = [
  { key: "appearance", label: "Appearance", icon: GearSix },
  { key: "layout", label: "Layout", icon: SquaresFour },
  { key: "themestudio", label: "Theme Studio", icon: PaintBrush },
  { key: "connections", label: "Connections", icon: Link },
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

export default function Settings({
  onBack,
  onUpdateLayout,
  onUpdateTheme,
  onResetAuth,
}: SettingsProps) {
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

  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyLoading, setSpotifyLoading] = useState<boolean>(false);

  const [aiProviders, setAiProviders] = useState<AIProviderConfig[]>([]);
  const [activeAIProvider, setActiveAIProvider] = useState<AIProviderType | null>(null);
  const [activeMusicProvider, setActiveMusicProvider] = useState<MusicProviderType>("spotify");
  const [aiKeyInputs, setAiKeyInputs] = useState<Record<AIProviderType, string>>({
    openai: "",
    anthropic: "",
    google: "",
    groq: "",
  });
  const [aiValidating, setAiValidating] = useState<AIProviderType | null>(null);
  const [aiValidationResults, setAiValidationResults] = useState<
    Record<AIProviderType, boolean | null>
  >({
    openai: null,
    anthropic: null,
    google: null,
    groq: null,
  });

  const refreshCustomThemes = useCallback(async () => {
    const themes = await loadCustomThemes();
    setCustomThemes(themes);
  }, []);

  const checkSpotifyConnection = useCallback(async () => {
    const hasTokens = await invoke<boolean>("has_valid_tokens");
    setSpotifyConnected(hasTokens);
  }, []);

  useEffect(() => {
    setLayout("Settings");

    (async () => {
      const settings = await readSettings();
      if (settings.theme) setCurrentTheme(settings.theme);
      if (settings.layout) setCurrentLayout(settings.layout);
      if (settings.ai_providers) {
        setAiProviders(settings.ai_providers);
        const results: Record<AIProviderType, boolean | null> = {
          openai: null,
          anthropic: null,
          google: null,
          groq: null,
        };
        for (const p of settings.ai_providers) {
          if (p.enabled) {
            const keyExists = await hasAIApiKey(p.provider);
            results[p.provider] = keyExists;
          }
        }
        setAiValidationResults(results);
      }
      if (settings.active_ai_provider) {
        setActiveAIProvider(settings.active_ai_provider);
      }
      if (settings.active_music_provider) {
        setActiveMusicProvider(settings.active_music_provider);
      }
      await refreshCustomThemes();
      await checkSpotifyConnection();
    })();
  }, [setLayout, refreshCustomThemes, checkSpotifyConnection]);

  useEffect(() => {
    const setupOAuthListener = async () => {
      const unlistenSuccess = await listen("oauth-success", async () => {
        setSpotifyLoading(false);
        await checkSpotifyConnection();
      });
      const unlistenFailed = await listen("oauth-failed", () => {
        setSpotifyLoading(false);
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
  }, [checkSpotifyConnection]);

  const handleSpotifyLogout = async () => {
    setSpotifyLoading(true);
    await invoke("clear_credentials");
    setSpotifyConnected(false);
    setSpotifyLoading(false);
    onResetAuth?.();
  };

  const handleSpotifyConnect = async () => {
    onResetAuth?.();
  };

  const handleValidateAIKey = async (provider: AIProviderType) => {
    const key = aiKeyInputs[provider];
    if (!key.trim()) return;

    setAiValidating(provider);
    const valid = await validateAIApiKey(provider, key);
    setAiValidationResults((prev) => ({ ...prev, [provider]: valid }));
    setAiValidating(null);

    if (valid) {
      await saveAIApiKey(provider, key);

      const existingIndex = aiProviders.findIndex((p) => p.provider === provider);
      let newProviders: AIProviderConfig[];
      if (existingIndex >= 0) {
        newProviders = [...aiProviders];
        newProviders[existingIndex] = { provider, enabled: true };
      } else {
        newProviders = [...aiProviders, { provider, enabled: true }];
      }
      setAiProviders(newProviders);

      const newActive = activeAIProvider ?? provider;
      setActiveAIProvider(newActive);

      await writeSettings({
        ai_providers: newProviders,
        active_ai_provider: newActive,
      });
    }
  };

  const handleRemoveAIProvider = async (provider: AIProviderType) => {
    await deleteAIApiKey(provider);

    const newProviders = aiProviders.filter((p) => p.provider !== provider);
    setAiProviders(newProviders);
    setAiKeyInputs((prev) => ({ ...prev, [provider]: "" }));
    setAiValidationResults((prev) => ({ ...prev, [provider]: null }));

    const newActive =
      activeAIProvider === provider
        ? (newProviders.find((p) => p.enabled)?.provider ?? null)
        : activeAIProvider;
    setActiveAIProvider(newActive);

    await writeSettings({
      ai_providers: newProviders,
      active_ai_provider: newActive,
    });
  };

  const handleSetActiveAIProvider = async (provider: AIProviderType) => {
    setActiveAIProvider(provider);
    await writeSettings({ active_ai_provider: provider });
  };

  const handleSetActiveMusicProvider = async (provider: MusicProviderType) => {
    setActiveMusicProvider(provider);
    await writeSettings({ active_music_provider: provider });
  };

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
      <div
        className="flex items-center justify-between mb-3"
        style={{ color: "var(--settings-header-text)" }}
      >
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
          {active === "connections" && (
            <div className="flex flex-col gap-4">
              <div className="font-medium flex items-center gap-2">
                <MusicNote size={18} weight="fill" />
                Music Provider
              </div>
              <p className="text-xs text-[--settings-text-muted]">
                Connect your music streaming accounts to control playback
              </p>

              {MUSIC_PROVIDERS.map(({ id, name, color, available }) => {
                const isSpotifyConnected = id === "spotify" && spotifyConnected;
                const isActive = activeMusicProvider === id;
                const IconComponent =
                  id === "spotify" ? SpotifyLogo : id === "apple" ? AppleLogo : YoutubeLogo;

                return (
                  <div
                    key={id}
                    className={`flex items-center justify-between p-4 rounded-xl border ${!available ? "opacity-50" : ""}`}
                    style={{
                      background: "rgba(0, 0, 0, 0.2)",
                      borderColor:
                        isSpotifyConnected && isActive
                          ? `${color}50`
                          : isSpotifyConnected
                            ? `${color}30`
                            : "rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: color }}
                      >
                        <IconComponent
                          size={24}
                          weight="fill"
                          color={id === "spotify" ? "#000" : "#fff"}
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{name}</span>
                        <span
                          className="text-xs flex items-center gap-1"
                          style={{
                            color: isSpotifyConnected ? color : "var(--settings-text-muted)",
                          }}
                        >
                          {!available ? (
                            "Coming soon"
                          ) : isSpotifyConnected ? (
                            <>
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: color }}
                              />
                              {isActive ? "Active" : "Connected"}
                            </>
                          ) : (
                            "Not connected"
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSpotifyConnected && !isActive && (
                        <button
                          type="button"
                          onClick={() => handleSetActiveMusicProvider(id)}
                          className="text-xs px-2 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          Set Active
                        </button>
                      )}

                      {id === "spotify" && spotifyConnected ? (
                        <button
                          type="button"
                          onClick={handleSpotifyLogout}
                          disabled={spotifyLoading}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <SignOut size={16} />
                          <span className="text-sm">Disconnect</span>
                        </button>
                      ) : id === "spotify" && available ? (
                        <button
                          type="button"
                          onClick={handleSpotifyConnect}
                          disabled={spotifyLoading}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-black font-medium hover:opacity-90 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: color }}
                        >
                          {spotifyLoading ? (
                            <span className="text-sm">Connecting...</span>
                          ) : (
                            <>
                              <SpotifyLogo size={16} weight="fill" />
                              <span className="text-sm">Connect</span>
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              <div className="border-t border-white/10 my-2" />

              <div className="font-medium flex items-center gap-2">
                <Brain size={18} weight="fill" />
                AI Provider
              </div>
              <p className="text-xs text-[--settings-text-muted]">
                Connect an AI provider to enable the AI DJ feature
              </p>

              {AI_PROVIDERS.map(({ id, name, model, color }) => {
                const isConnected = aiProviders.some((p) => p.provider === id && p.enabled);
                const isActive = activeAIProvider === id;
                const validationResult = aiValidationResults[id];
                const isValidating = aiValidating === id;

                return (
                  <div
                    key={id}
                    className="flex flex-col gap-2 p-4 rounded-xl border"
                    style={{
                      background: "rgba(0, 0, 0, 0.2)",
                      borderColor:
                        isConnected && isActive
                          ? `${color}50`
                          : isConnected
                            ? `${color}30`
                            : "rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ background: color }}
                        >
                          <Brain size={24} weight="fill" color="#fff" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{name}</span>
                          <span className="text-[10px] text-[--settings-text-muted] opacity-70">
                            {model}
                          </span>
                          <span
                            className="text-xs flex items-center gap-1 mt-0.5"
                            style={{
                              color: isConnected ? color : "var(--settings-text-muted)",
                            }}
                          >
                            {isConnected ? (
                              <>
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ background: color }}
                                />
                                {isActive ? "Active" : "Connected"}
                              </>
                            ) : (
                              "Not connected"
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isConnected && !isActive && (
                          <button
                            type="button"
                            onClick={() => handleSetActiveAIProvider(id)}
                            className="text-xs px-2 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            Set Active
                          </button>
                        )}

                        {isConnected && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAIProvider(id)}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all duration-200 cursor-pointer text-xs"
                          >
                            <Trash size={12} />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {!isConnected && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="password"
                          placeholder="Enter API key..."
                          value={aiKeyInputs[id]}
                          onChange={(e) =>
                            setAiKeyInputs((prev) => ({ ...prev, [id]: e.target.value }))
                          }
                          className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-xs focus:outline-none focus:border-[--settings-accent]"
                          style={{ color: "var(--settings-text)" }}
                        />
                        <button
                          type="button"
                          onClick={() => handleValidateAIKey(id)}
                          disabled={isValidating || !aiKeyInputs[id].trim()}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-white font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                          style={{ background: color }}
                        >
                          {isValidating ? (
                            <CircleNotch size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                          {isValidating ? "Validating..." : "Connect"}
                        </button>
                      </div>
                    )}

                    {validationResult === false && !isConnected && (
                      <div className="flex items-center gap-1 text-xs text-red-400">
                        <Warning size={12} />
                        Invalid API key. Please check and try again.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {active === "appearance" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Built-in Themes</div>
                <span className="text-xs text-[--settings-text-muted]">
                  Current:{" "}
                  {currentTheme.startsWith("custom:")
                    ? currentTheme.replace("custom:", "")
                    : currentTheme}
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
