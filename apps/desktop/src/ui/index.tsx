import { useEffect, useState } from "react";
import "./global.css";
import "./library.css";

import { LogicalPosition } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getActiveProvider as getActiveAIProvider } from "../lib/aiClient";
import { useAIQueueStore } from "../lib/aiQueueStore";
import {
  type Settings as AppSettings,
  loadCustomThemes,
  readSettings,
  SETTINGS_CHANGED_EVENT,
  writeSettings,
} from "../lib/settingLib";
import { applyCustomThemeFromJson, applyThemeByName } from "../loader/themeLoader";
import { getActiveProvider } from "../providers";
import type { UnifiedTrack } from "../providers/types";
import AppUpdater from "./components/AppUpdater";
import MusicVisualizer from "./components/MusicVisualizer";
import DesktopShell from "./DesktopShell";
import LayoutA from "./layouts/LayoutA";
import LayoutB from "./layouts/LayoutB";
import LayoutC from "./layouts/LayoutC";
import LayoutD from "./layouts/LayoutD";
import LayoutE from "./layouts/LayoutE";
import LayoutF from "./layouts/LayoutF";

import AddToPlaylistView from "./views/AddToPlaylistView";
import AIDJView from "./views/AIDJView";
import Boot from "./views/Boot";
import PlaylistView from "./views/PlaylistView";
import SearchBar from "./views/SearchBar";
import Settings from "./views/Settings";
import VolumeView from "./views/VolumeView";

type AppView = "app" | "settings" | "search" | "aidj" | "playlist" | "addToPlaylist" | "volume";

type AddToPlaylistTrack = UnifiedTrack | null;

type BootInitialStep = "provider" | "spotify-setup";

function MiniPlayerApp() {
  const [firstBootDone, setFirstBootDone] = useState<boolean | null>(null);
  const [isReconnect, setIsReconnect] = useState<boolean>(false);
  const [bootStep, setBootStep] = useState<BootInitialStep>("provider");
  const [layout, setLayout] = useState<string>("LayoutA");
  const [theme, setTheme] = useState<string>("dark");
  const [view, setView] = useState<AppView>("app");
  const [showAIQueueBorder, setShowAIQueueBorder] = useState<boolean>(true);
  const [showMusicVisualizer, setShowMusicVisualizer] = useState<boolean>(false);
  const [musicVisualizerColor, setMusicVisualizerColor] = useState<string>("theme");
  const [musicVisualizerIntensity, setMusicVisualizerIntensity] = useState<number>(100);
  const [windowOpacity, setWindowOpacity] = useState<number>(100);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<AddToPlaylistTrack>(null);

  const aiQueueActive = useAIQueueStore((s) => s.isActive);
  const showBorder = aiQueueActive && showAIQueueBorder;

  // ---- Load persisted settings
  useEffect(() => {
    (async () => {
      const settings = await readSettings();
      setLayout(settings.layout ?? "LayoutA");
      setTheme(settings.theme ?? "dark");
      setShowAIQueueBorder(settings.show_ai_queue_border ?? true);
      setShowMusicVisualizer(settings.show_music_visualizer ?? false);
      setMusicVisualizerColor(settings.music_visualizer_color ?? "theme");
      setMusicVisualizerIntensity(settings.music_visualizer_intensity ?? 100);
      setWindowOpacity(settings.window_opacity ?? 100);

      // Check if the provider is actually authenticated
      if (settings.first_boot_done) {
        try {
          const provider = await getActiveProvider();
          const isAuth = await provider.isAuthenticated();
          if (!isAuth) {
            // Provider is not authenticated, need to re-authenticate
            setFirstBootDone(false);
            return;
          }
        } catch (err) {
          console.error("Error checking auth:", err);
          setFirstBootDone(false);
          return;
        }
      }

      setFirstBootDone(settings.first_boot_done ?? false);
    })();
  }, []);

  // ---- Follow settings changed in the other window (desktop shell <-> mini)
  useEffect(() => {
    const applyShared = (settings: AppSettings) => {
      setLayout(settings.layout ?? "LayoutA");
      setTheme(settings.theme ?? "dark");
      setShowAIQueueBorder(settings.show_ai_queue_border ?? true);
      setShowMusicVisualizer(settings.show_music_visualizer ?? false);
      setMusicVisualizerColor(settings.music_visualizer_color ?? "theme");
      setMusicVisualizerIntensity(settings.music_visualizer_intensity ?? 100);
      setWindowOpacity(settings.window_opacity ?? 100);
    };

    const unlisten = listen<AppSettings>(SETTINGS_CHANGED_EVENT, (event) => {
      if (event.payload) applyShared(event.payload);
    });

    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  // ---- Apply theme
  useEffect(() => {
    const applyTheme = async () => {
      if (theme.startsWith("custom:")) {
        const themeName = theme.replace("custom:", "");
        const customThemes = await loadCustomThemes();
        const customTheme = customThemes.find((t) => t.name === themeName);
        if (customTheme) {
          applyCustomThemeFromJson(JSON.stringify(customTheme));
          return;
        }
        console.warn(`Custom theme "${themeName}" not found, falling back to default theme`);
        applyThemeByName("dark");
        return;
      }
      applyThemeByName(theme);
    };
    applyTheme();
  }, [theme]);

  // ---- Apply window opacity
  useEffect(() => {
    document.body.style.opacity = String(windowOpacity / 100);
  }, [windowOpacity]);

  // ---- Keyboard shortcuts
  useEffect(() => {
    if (!firstBootDone) return;

    const onKeyDown = async (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Escape: Back to app
      if (e.key === "Escape" && view !== "app") {
        e.preventDefault();
        setView("app");
        return;
      }

      // Ctrl shortcuts
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "s": // Ctrl+S: Search
            e.preventDefault();
            setView("search");
            break;
          case "p": // Ctrl+P: Playlists
            e.preventDefault();
            setView("playlist");
            break;
          case "e": // Ctrl+E: Settings
            e.preventDefault();
            setView("settings");
            break;
          case "m": // Ctrl+M: Volume
            e.preventDefault();
            setView("volume");
            break;
          case "d": {
            // Ctrl+D: AI DJ (if available)
            e.preventDefault();
            const settings = await readSettings();
            const hasAI =
              getActiveAIProvider(settings.ai_providers, settings.active_ai_provider) !== null;
            if (hasAI) {
              setView("aidj");
            }
            break;
          }
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [firstBootDone, view]);

  // ---- Native OS context menu
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();

      const showMenu = async () => {
        const settings = await readSettings();
        const hasAI =
          getActiveAIProvider(settings.ai_providers, settings.active_ai_provider) !== null;

        const settingsItem = await MenuItem.new({
          text: "Settings\t\t\t\tCtrl+E",
          action: () => setView("settings"),
        });

        const searchItem = await MenuItem.new({
          text: "Search\t\t\t\tCtrl+S",
          action: () => setView("search"),
        });

        const playlistItem = await MenuItem.new({
          text: "Playlists\t\t\t\tCtrl+P",
          action: () => setView("playlist"),
        });

        const volumeItem = await MenuItem.new({
          text: "Volume\t\t\t\tCtrl+M",
          action: () => setView("volume"),
        });

        const separator = await PredefinedMenuItem.new({ item: "Separator" });
        const minimizeItem = await PredefinedMenuItem.new({ item: "Minimize" });
        const closeItem = await PredefinedMenuItem.new({ item: "CloseWindow" });

        let menu: Menu;
        if (hasAI) {
          const aiDjItem = await MenuItem.new({
            text: "AI DJ\t\t\t\tCtrl+D",
            action: () => setView("aidj"),
          });
          menu = await Menu.new({
            items: [
              settingsItem,
              searchItem,
              playlistItem,
              volumeItem,
              aiDjItem,
              separator,
              minimizeItem,
              closeItem,
            ],
          });
        } else {
          menu = await Menu.new({
            items: [
              settingsItem,
              searchItem,
              playlistItem,
              volumeItem,
              separator,
              minimizeItem,
              closeItem,
            ],
          });
        }
        await menu.popup(new LogicalPosition(e.clientX + 12, e.clientY), getCurrentWindow());
      };

      void showMenu();
    };

    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  const handleDragStart = () => {
    getCurrentWindow().startDragging();
  };

  // ---- Loading state
  if (firstBootDone === null) {
    return (
      <div className="h-full w-full no-drag relative">
        <div className="drag-area" onMouseDown={handleDragStart} />
      </div>
    );
  }

  if (!firstBootDone) {
    return (
      <div className="h-full w-full no-drag relative theme-scope">
        <div className="drag-area" onMouseDown={handleDragStart} />
        <Boot
          initialStep={bootStep}
          skipAuthCheck={isReconnect}
          onComplete={async () => {
            await writeSettings({
              first_boot_done: true,
              active_music_provider: "spotify",
              layout,
              theme,
            });
            setFirstBootDone(true);
            setIsReconnect(false);
            setBootStep("provider");
          }}
        />
      </div>
    );
  }

  const handleOpenAddToPlaylist = (track: UnifiedTrack) => {
    setAddToPlaylistTrack(track);
    setView("addToPlaylist");
  };

  // ---- Layout renderer
  const renderLayout = () => {
    if (layout === "LayoutB") return <LayoutB onAddToPlaylist={handleOpenAddToPlaylist} />;
    if (layout === "LayoutC") return <LayoutC />;
    if (layout === "LayoutD") return <LayoutD />;
    if (layout === "LayoutE") return <LayoutE />;
    if (layout === "LayoutF") return <LayoutF />;
    return <LayoutA />;
  };

  // ---- View renderer (app / settings / search / aidj)
  const renderView = () => {
    if (view === "settings") {
      return (
        <Settings
          onBack={() => setView("app")}
          onUpdateLayout={setLayout}
          onUpdateTheme={setTheme}
          onResetAuth={(provider?: "spotify") => {
            setIsReconnect(true);
            if (provider === "spotify") {
              setBootStep("spotify-setup");
            } else {
              setBootStep("provider");
            }
            setFirstBootDone(false);
            setView("app");
          }}
          onUpdateAIQueueBorder={setShowAIQueueBorder}
          onUpdateMusicVisualizer={setShowMusicVisualizer}
          onUpdateMusicVisualizerColor={setMusicVisualizerColor}
          onUpdateMusicVisualizerIntensity={setMusicVisualizerIntensity}
          onUpdateWindowOpacity={setWindowOpacity}
        />
      );
    }
    if (view === "search") {
      return <SearchBar onBack={() => setView("app")} />;
    }
    if (view === "aidj") {
      return <AIDJView onBack={() => setView("app")} />;
    }
    if (view === "playlist") {
      return <PlaylistView onBack={() => setView("app")} />;
    }
    if (view === "volume") {
      return <VolumeView onBack={() => setView("app")} />;
    }
    if (view === "addToPlaylist") {
      return (
        <AddToPlaylistView
          track={addToPlaylistTrack}
          onBack={() => {
            setView("app");
            setAddToPlaylistTrack(null);
          }}
        />
      );
    }
    return renderLayout();
  };

  return (
    <div className="h-full w-full no-drag relative theme-scope transition-all duration-300">
      <div className="drag-area" onMouseDown={handleDragStart} />
      {renderView()}
      {showMusicVisualizer && view === "app" && (
        <MusicVisualizer colorMode={musicVisualizerColor} intensity={musicVisualizerIntensity} />
      )}
      {showBorder && (
        <div
          className="absolute inset-0 pointer-events-none z-50"
          style={{
            border: "1.5px solid #7f1d1d",
            borderRadius: "12px",
            boxShadow:
              "inset 0 0 30px rgba(127, 29, 29, 0.4), inset 0 0 60px rgba(127, 29, 29, 0.15)",
          }}
        />
      )}
    </div>
  );
}

function DesktopApp() {
  const [firstBootDone, setFirstBootDone] = useState<boolean | null>(null);
  const [isReconnect, setIsReconnect] = useState(false);
  const [bootStep, setBootStep] = useState<BootInitialStep>("provider");
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    document.body.classList.add("desktop-window");
    document.body.classList.remove("mini-window");
    return () => {
      document.body.classList.remove("desktop-window");
    };
  }, []);

  useEffect(() => {
    (async () => {
      const settings = await readSettings();
      setTheme(settings.theme ?? "dark");

      if (settings.first_boot_done) {
        try {
          const provider = await getActiveProvider();
          const isAuth = await provider.isAuthenticated();
          setFirstBootDone(isAuth);
          return;
        } catch (err) {
          console.error("Error checking auth:", err);
          setFirstBootDone(false);
          return;
        }
      }

      setFirstBootDone(false);
    })();
  }, []);

  useEffect(() => {
    const applyTheme = async () => {
      if (theme.startsWith("custom:")) {
        const themeName = theme.replace("custom:", "");
        const customThemes = await loadCustomThemes();
        const customTheme = customThemes.find((t) => t.name === themeName);
        if (customTheme) {
          applyCustomThemeFromJson(JSON.stringify(customTheme));
          return;
        }
      }
      applyThemeByName(theme);
    };

    applyTheme();
  }, [theme]);

  const handleComplete = async () => {
    await writeSettings({
      first_boot_done: true,
      active_music_provider: "spotify",
      theme,
    });
    setFirstBootDone(true);
    setIsReconnect(false);
    setBootStep("provider");
  };

  const handleResetAuth = (provider?: "spotify") => {
    setIsReconnect(true);
    if (provider === "spotify") {
      setBootStep("spotify-setup");
    } else {
      setBootStep("provider");
    }
    setFirstBootDone(false);
  };

  if (firstBootDone === null) {
    return <div className="desktop-shell desktop-loading font-circular" />;
  }

  if (!firstBootDone) {
    return (
      <div className="h-full w-full theme-scope">
        <Boot initialStep={bootStep} skipAuthCheck={isReconnect} onComplete={handleComplete} />
      </div>
    );
  }

  return (
    <div className="h-full w-full theme-scope">
      <DesktopShell onResetAuth={handleResetAuth} onUpdateTheme={setTheme} />
      <AppUpdater />
    </div>
  );
}

export default function App() {
  const isMiniWindow = new URLSearchParams(window.location.search).get("window") === "mini";

  useEffect(() => {
    document.body.classList.toggle("mini-window", isMiniWindow);
    document.body.classList.toggle("desktop-window", !isMiniWindow);
  }, [isMiniWindow]);

  return isMiniWindow ? <MiniPlayerApp /> : <DesktopApp />;
}
