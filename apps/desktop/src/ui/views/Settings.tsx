import {
  AppleLogo,
  ArrowLeft,
  Brain,
  Check,
  CircleNotch,
  DiscordLogo,
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
  deleteAIApiKey,
  deleteCustomTheme,
  exportCustomTheme,
  hasAIApiKey,
  loadCustomThemes,
  type MusicProviderType,
  readSettings,
  saveAIApiKey,
  saveCustomTheme,
  writeSettings,
} from "../../lib/settingLib";
import { applyCustomThemeFromJson, validateThemeJsonFormat } from "../../loader/themeLoader";
import { clearProviderCache } from "../../providers";
import { clearYouTubeState } from "../../providers/youtube";
import { clearSpotifyTokenCache } from "../spotifyClient";

const AI_PROVIDERS: { id: AIProviderType; name: string; model: string; color: string }[] = [
  { id: "openai", name: "OpenAI", model: "GPT-4o Mini", color: "#10A37F" },
  { id: "anthropic", name: "Anthropic", model: "Claude 3 Haiku", color: "#D97757" },
  { id: "google", name: "Google AI", model: "Gemini 1.5 Flash", color: "#4285F4" },
  { id: "groq", name: "Groq", model: "Llama 3.1 8B", color: "#F55036" },
];

const MUSIC_PROVIDERS: {
  id: MusicProviderType | "apple";
  name: string;
  color: string;
  iconColor: string;
  available: boolean;
}[] = [
  { id: "spotify", name: "Spotify", color: "#1DB954", iconColor: "#000", available: true },
  { id: "youtube", name: "YouTube Music", color: "#FF0000", iconColor: "#fff", available: true },
  { id: "apple", name: "Apple Music", color: "#FC3C44", iconColor: "#fff", available: false },
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
  onResetAuth?: (provider?: "spotify" | "youtube") => void;
  onUpdateAIQueueBorder?: (show: boolean) => void;
  onMusicProviderChange?: (provider: MusicProviderType) => void;
};

const categories = [
  { key: "appearance", label: "Appearance", icon: GearSix },
  { key: "layout", label: "Layout", icon: SquaresFour },
  { key: "themestudio", label: "Theme Studio", icon: PaintBrush },
  { key: "connections", label: "Connections", icon: Link },
  { key: "aidj", label: "AI DJ", icon: Brain },
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
  onUpdateAIQueueBorder,
  onMusicProviderChange,
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
  const [youtubeConnected, setYoutubeConnected] = useState<boolean>(false);
  const [youtubeLoading, setYoutubeLoading] = useState<boolean>(false);

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
  const [showAIQueueBorder, setShowAIQueueBorder] = useState<boolean>(true);
  const [discordRpcEnabled, setDiscordRpcEnabled] = useState<boolean>(true);
  const [showClearDialog, setShowClearDialog] = useState<boolean>(false);
  const [clearingData, setClearingData] = useState<boolean>(false);

  const refreshCustomThemes = useCallback(async () => {
    const themes = await loadCustomThemes();
    setCustomThemes(themes);
  }, []);

  const checkSpotifyConnection = useCallback(async () => {
    const hasTokens = await invoke<boolean>("has_valid_tokens");
    setSpotifyConnected(hasTokens);
    return hasTokens;
  }, []);

  const checkYouTubeConnection = useCallback(async () => {
    const hasTokens = await invoke<boolean>("has_valid_youtube_tokens");
    setYoutubeConnected(hasTokens);
    return hasTokens;
  }, []);

  const autoActivateSingleProvider = useCallback(async () => {
    const spotifyOk = await invoke<boolean>("has_valid_tokens");
    const youtubeOk = await invoke<boolean>("has_valid_youtube_tokens");

    if (spotifyOk && !youtubeOk && activeMusicProvider !== "spotify") {
      clearYouTubeState();
      clearSpotifyTokenCache();
      clearProviderCache();
      setActiveMusicProvider("spotify");
      await writeSettings({ active_music_provider: "spotify" });
      onMusicProviderChange?.("spotify");
    } else if (!spotifyOk && youtubeOk && activeMusicProvider !== "youtube") {
      clearYouTubeState();
      clearSpotifyTokenCache();
      clearProviderCache();
      setActiveMusicProvider("youtube");
      await writeSettings({ active_music_provider: "youtube" });
      onMusicProviderChange?.("youtube");
    }
  }, [activeMusicProvider, onMusicProviderChange]);

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
      setShowAIQueueBorder(settings.show_ai_queue_border ?? true);
      setDiscordRpcEnabled(settings.discord_rpc_enabled ?? true);
      await refreshCustomThemes();
      await checkSpotifyConnection();
      await checkYouTubeConnection();
      await autoActivateSingleProvider();
    })();
  }, [
    setLayout,
    refreshCustomThemes,
    checkSpotifyConnection,
    checkYouTubeConnection,
    autoActivateSingleProvider,
  ]);

  useEffect(() => {
    const setupOAuthListener = async () => {
      const unlistenSuccess = await listen("oauth-success", async () => {
        setSpotifyLoading(false);
        await checkSpotifyConnection();
      });
      const unlistenFailed = await listen("oauth-failed", () => {
        setSpotifyLoading(false);
      });
      const unlistenYTSuccess = await listen("youtube-oauth-success", async () => {
        setYoutubeLoading(false);
        await checkYouTubeConnection();
      });
      const unlistenYTFailed = await listen("youtube-oauth-failed", () => {
        setYoutubeLoading(false);
      });

      return () => {
        unlistenSuccess();
        unlistenFailed();
        unlistenYTSuccess();
        unlistenYTFailed();
      };
    };

    const cleanup = setupOAuthListener();
    return () => {
      cleanup.then((c) => c());
    };
  }, [checkSpotifyConnection, checkYouTubeConnection]);

  const handleSpotifyLogout = async () => {
    setSpotifyLoading(true);
    await invoke("clear_credentials");
    setSpotifyConnected(false);
    setSpotifyLoading(false);
    onResetAuth?.();
  };

  const handleSpotifyConnect = async () => {
    onResetAuth?.("spotify");
  };

  const handleYouTubeConnect = async () => {
    onResetAuth?.("youtube");
  };

  const handleYouTubeLogout = async () => {
    setYoutubeLoading(true);
    await invoke("clear_youtube_credentials");
    setYoutubeConnected(false);
    setYoutubeLoading(false);
  };

  const handleClearEverything = async () => {
    setClearingData(true);
    try {
      await invoke("clear_everything");
      setShowClearDialog(false);
      onResetAuth?.();
    } catch (e) {
      console.error("Failed to clear data:", e);
    } finally {
      setClearingData(false);
    }
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
    clearYouTubeState();
    clearSpotifyTokenCache();
    clearProviderCache();
    setActiveMusicProvider(provider);
    await writeSettings({ active_music_provider: provider });
    onMusicProviderChange?.(provider);
  };

  const handleToggleAIQueueBorder = async () => {
    const newValue = !showAIQueueBorder;
    setShowAIQueueBorder(newValue);
    await writeSettings({ show_ai_queue_border: newValue });
    onUpdateAIQueueBorder?.(newValue);
  };

  const handleToggleDiscordRpc = async () => {
    const newValue = !discordRpcEnabled;
    setDiscordRpcEnabled(newValue);
    await writeSettings({ discord_rpc_enabled: newValue });
    try {
      if (newValue) {
        await invoke("enable_discord_rpc");
      } else {
        await invoke("disable_discord_rpc");
      }
    } catch (err) {
      console.warn("Discord RPC toggle failed:", err);
    }
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

              {MUSIC_PROVIDERS.map(({ id, name, color, iconColor, available }) => {
                const isConnected =
                  (id === "spotify" && spotifyConnected) || (id === "youtube" && youtubeConnected);
                const isActive = activeMusicProvider === id;
                const isLoading =
                  (id === "spotify" && spotifyLoading) || (id === "youtube" && youtubeLoading);
                const IconComponent =
                  id === "spotify" ? SpotifyLogo : id === "apple" ? AppleLogo : YoutubeLogo;

                return (
                  <div
                    key={id}
                    className={`flex items-center justify-between p-4 rounded-xl border ${!available ? "opacity-50" : ""}`}
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
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: color }}
                      >
                        <IconComponent size={24} weight="fill" color={iconColor} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{name}</span>
                        <span
                          className="text-xs flex items-center gap-1"
                          style={{
                            color: isConnected ? color : "var(--settings-text-muted)",
                          }}
                        >
                          {!available ? (
                            "Coming soon"
                          ) : isConnected ? (
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
                      ) : id === "youtube" && youtubeConnected ? (
                        <button
                          type="button"
                          onClick={handleYouTubeLogout}
                          disabled={youtubeLoading}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <SignOut size={16} />
                          <span className="text-sm">Disconnect</span>
                        </button>
                      ) : id === "youtube" && available ? (
                        <button
                          type="button"
                          onClick={handleYouTubeConnect}
                          disabled={isLoading}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: color }}
                        >
                          {isLoading ? (
                            <span className="text-sm">Connecting...</span>
                          ) : (
                            <>
                              <YoutubeLogo size={16} weight="fill" />
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

              <div className="border-t border-white/10 my-2" />

              <div className="font-medium flex items-center gap-2">
                <DiscordLogo size={18} weight="fill" />
                Discord Rich Presence
              </div>
              <p className="text-xs text-[--settings-text-muted]">
                Show what you're listening to on your Discord profile
              </p>

              <div
                className="flex items-center justify-between p-4 rounded-xl border"
                style={{
                  background: "rgba(0, 0, 0, 0.2)",
                  borderColor: discordRpcEnabled ? "#5865F230" : "rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: "#5865F2" }}
                  >
                    <DiscordLogo size={24} weight="fill" color="#fff" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">Discord Status</span>
                    <span
                      className="text-xs flex items-center gap-1"
                      style={{
                        color: discordRpcEnabled ? "#5865F2" : "var(--settings-text-muted)",
                      }}
                    >
                      {discordRpcEnabled ? (
                        <>
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: "#5865F2" }}
                          />
                          Showing activity
                        </>
                      ) : (
                        "Disabled"
                      )}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleDiscordRpc}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${
                    discordRpcEnabled ? "bg-[#5865F2]" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${
                      discordRpcEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
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

          {active === "aidj" && (
            <div className="flex flex-col gap-4">
              <div className="font-medium flex items-center gap-2">
                <Brain size={18} weight="fill" />
                AI Queue Settings
              </div>
              <p className="text-xs text-[--settings-text-muted]">
                Configure the AI DJ auto-queue feature that generates endless playlists based on
                your listening history.
              </p>

              <div
                className="flex items-center justify-between p-4 rounded-xl border"
                style={{
                  background: "rgba(0, 0, 0, 0.2)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                }}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Show Token Warning Border</span>
                  <span className="text-xs text-[--settings-text-muted]">
                    Display a red border around the app when AI Queue is active to indicate token
                    usage
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAIQueueBorder}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${
                    showAIQueueBorder ? "bg-red-500" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${
                      showAIQueueBorder ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-white/10 my-2" />

              <div className="font-medium">How AI Queue Works</div>
              <div className="text-xs text-[--settings-text-muted] space-y-2">
                <p>
                  1. Analyzes your last 30 played tracks and top artists using TOON format (saves
                  ~40% tokens)
                </p>
                <p>2. AI generates 5 tracks that flow well with your listening history</p>
                <p>3. Tracks are automatically queued and played</p>
                <p>4. When 2 tracks remain, the next batch is fetched automatically</p>
                <p>5. User preferences are cached for 10 minutes to minimize API calls</p>
              </div>

              <div
                className="p-3 rounded-lg text-xs"
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  borderLeft: "3px solid #ef4444",
                }}
              >
                <span className="font-medium text-red-400">Note:</span>{" "}
                <span className="text-[--settings-text-muted]">
                  AI Queue uses your configured AI provider and will consume tokens. The red border
                  serves as a visual reminder when active.
                </span>
              </div>
            </div>
          )}

          {active === "privacy" && (
            <div className="flex flex-col gap-4">
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
              <p className="text-[--settings-text-muted] leading-relaxed">
                This app runs locally. No personal data is collected by us.
              </p>

              <div className="border-t border-white/10 my-1" />

              <div className="font-medium flex items-center gap-2">
                <Brain size={18} weight="fill" />
                AI DJ Data Usage
              </div>
              <p className="text-xs text-[--settings-text-muted]">
                When using the AI DJ feature, the following data is sent to your configured LLM
                provider:
              </p>

              <div
                className="p-3 rounded-lg text-xs space-y-1.5"
                style={{
                  background: "rgba(0, 0, 0, 0.2)",
                  borderLeft: "3px solid var(--settings-accent)",
                }}
              >
                <div className="text-[--settings-text-muted]">
                  <span className="font-medium text-[--settings-text]">• Display Name</span> – Your
                  Spotify username
                </div>
                <div className="text-[--settings-text-muted]">
                  <span className="font-medium text-[--settings-text]">• Currently Playing</span> –
                  Track name and artist
                </div>
                <div className="text-[--settings-text-muted]">
                  <span className="font-medium text-[--settings-text]">• Recent Tracks</span> – Last
                  15 played songs (names and artists)
                </div>
                <div className="text-[--settings-text-muted]">
                  <span className="font-medium text-[--settings-text]">• Top Artists</span> – Your
                  most listened artists and genres
                </div>
                <div className="text-[--settings-text-muted]">
                  <span className="font-medium text-[--settings-text]">• Time of Day</span> – For
                  contextual recommendations
                </div>
              </div>

              <p className="text-xs text-[--settings-text-muted]">
                This data is sent directly to your chosen AI provider (OpenAI, Anthropic, Google, or
                Groq). We do not store or process this data ourselves.
              </p>

              <div className="border-t border-white/10 my-4" />

              <div className="font-medium flex items-center gap-2 text-red-400">
                <Trash size={18} weight="fill" />
                Clear All Data
              </div>
              <p className="text-xs text-[--settings-text-muted]">
                Permanently delete all stored data including Spotify tokens, AI API keys, settings,
                and custom themes. This action cannot be undone.
              </p>

              <button
                type="button"
                onClick={() => setShowClearDialog(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all duration-200 cursor-pointer w-fit"
              >
                <Trash size={16} />
                <span className="text-sm font-medium">Clear Everything</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {showClearDialog && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !clearingData && setShowClearDialog(false)}
            onKeyDown={() => {}}
          />
          <div
            className="relative p-6 rounded-2xl max-w-sm w-full mx-4 animate-fadeIn"
            style={{
              background: "rgba(30, 30, 30, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-500/20">
                <Warning size={24} weight="fill" className="text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Clear All Data?</h3>
            </div>

            <p className="text-sm text-[--settings-text-muted] mb-6">
              This will permanently delete all your data including Spotify authentication, AI API
              keys, settings, and custom themes. You will need to set up the app again.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowClearDialog(false)}
                disabled={clearingData}
                className="flex-1 px-4 py-2.5 rounded-lg border border-white/20 text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearEverything}
                disabled={clearingData}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {clearingData ? (
                  <>
                    <CircleNotch size={16} className="animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash size={16} />
                    Clear All
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
