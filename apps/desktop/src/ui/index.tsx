import { useEffect, useRef, useState } from "react";
import "./global.css";

import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getActiveProvider as getActiveAIProvider } from "../lib/aiClient";
import { useAIQueueStore } from "../lib/aiQueueStore";
import { loadCustomThemes, readSettings, writeSettings } from "../lib/settingLib";
import { applyCustomThemeFromJson, applyThemeByName } from "../loader/themeLoader";
import { getActiveProvider, getActiveProviderType } from "../providers";
import { setYouTubePlayerRef, updateCurrentYouTubeTrack } from "../providers/youtube";
import { YouTubePlayer, type YouTubePlayerRef } from "./components/YouTubePlayer";

import LayoutA from "./layouts/LayoutA";
import LayoutB from "./layouts/LayoutB";
import LayoutC from "./layouts/LayoutC";

import AddToPlaylistView from "./views/AddToPlaylistView";
import AIDJView from "./views/AIDJView";
import Boot from "./views/Boot";
import PlaylistView from "./views/PlaylistView";
import SearchBar from "./views/SearchBar";
import Settings from "./views/Settings";
import VolumeView from "./views/VolumeView";

type AppView = "app" | "settings" | "search" | "aidj" | "playlist" | "addToPlaylist" | "volume";

type AddToPlaylistTrack = {
  id: string;
  name: string;
} | null;

type BootInitialStep = "provider" | "spotify-setup" | "youtube-setup";

export default function App() {
  const [firstBootDone, setFirstBootDone] = useState<boolean | null>(null);
  const [isReconnect, setIsReconnect] = useState<boolean>(false);
  const [bootStep, setBootStep] = useState<BootInitialStep>("provider");
  const [layout, setLayout] = useState<string>("LayoutA");
  const [theme, setTheme] = useState<string>("dark");
  const [view, setView] = useState<AppView>("app");
  const [showAIQueueBorder, setShowAIQueueBorder] = useState<boolean>(true);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<AddToPlaylistTrack>(null);
  const [_isYouTubeActive, setIsYouTubeActive] = useState<boolean>(false);
  const youtubePlayerRef = useRef<YouTubePlayerRef | null>(null);

  const aiQueueActive = useAIQueueStore((s) => s.isActive);
  const showBorder = aiQueueActive && showAIQueueBorder;

  // ---- Load persisted settings
  useEffect(() => {
    (async () => {
      const settings = await readSettings();
      setLayout(settings.layout ?? "LayoutA");
      setTheme(settings.theme ?? "dark");
      setShowAIQueueBorder(settings.show_ai_queue_border ?? true);

      const providerType = await getActiveProviderType();
      setIsYouTubeActive(providerType === "youtube");

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
            const providerType = await getActiveProviderType();
            setIsYouTubeActive(providerType === "youtube");
            await writeSettings({
              first_boot_done: true,
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

  const handleOpenAddToPlaylist = (trackId: string, trackName: string) => {
    setAddToPlaylistTrack({ id: trackId, name: trackName });
    setView("addToPlaylist");
  };

  // ---- Layout renderer
  const renderLayout = () => {
    if (layout === "LayoutB") return <LayoutB onAddToPlaylist={handleOpenAddToPlaylist} />;
    if (layout === "LayoutC") return <LayoutC />;
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
          onResetAuth={(provider?: "spotify" | "youtube") => {
            setIsReconnect(true);
            if (provider === "youtube") {
              setBootStep("youtube-setup");
            } else if (provider === "spotify") {
              setBootStep("spotify-setup");
            } else {
              setBootStep("provider");
            }
            setFirstBootDone(false);
            setView("app");
          }}
          onUpdateAIQueueBorder={setShowAIQueueBorder}
          onMusicProviderChange={(provider) => {
            setIsYouTubeActive(provider === "youtube");
          }}
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
          trackId={addToPlaylistTrack?.id ?? null}
          trackName={addToPlaylistTrack?.name ?? null}
          onBack={() => {
            setView("app");
            setAddToPlaylistTrack(null);
          }}
        />
      );
    }
    return renderLayout();
  };

  const handleYouTubeReady = async () => {
    if (youtubePlayerRef.current) {
      setYouTubePlayerRef(youtubePlayerRef.current);

      // Apply saved volume
      const settings = await readSettings();
      const savedVolume = settings.youtube_volume ?? 50;
      youtubePlayerRef.current.setVolume(savedVolume);
    }
  };

  const handleYouTubeVideoChange = (data: {
    videoId: string;
    title: string;
    author: string;
    duration: number;
  }) => {
    updateCurrentYouTubeTrack(data);
  };

  return (
    <div className="h-full w-full no-drag relative theme-scope transition-all duration-300">
      <div className="drag-area" onMouseDown={handleDragStart} />
      {renderView()}
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
      {/* Always mount YouTube player so it's ready when needed */}
      <YouTubePlayer
        playerRef={youtubePlayerRef}
        onReady={handleYouTubeReady}
        onVideoChange={handleYouTubeVideoChange}
      />
    </div>
  );
}
