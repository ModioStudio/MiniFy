import { useEffect, useState } from "react";
import "./global.css";

import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getActiveProvider } from "../lib/aiClient";
import { loadCustomThemes, readSettings, writeSettings } from "../lib/settingLib";
import { applyCustomThemeFromJson, applyThemeByName } from "../loader/themeLoader";

import LayoutA from "./layouts/LayoutA";
import LayoutB from "./layouts/LayoutB";
import LayoutC from "./layouts/LayoutC";

import AIDJView from "./views/AIDJView";
import Boot from "./views/Boot";
import SearchBar from "./views/SearchBar";
import Settings from "./views/Settings";
import { SplashScreen } from "./views/SplashScreen";

type AppView = "app" | "settings" | "search" | "aidj";

export default function App() {
  const [firstBootDone, setFirstBootDone] = useState<boolean | null>(null);
  const [isReconnect, setIsReconnect] = useState<boolean>(false);
  const [layout, setLayout] = useState<string>("LayoutA");
  const [theme, setTheme] = useState<string>("dark");
  const [view, setView] = useState<AppView>("app");


  // ---- Load persisted settings
  useEffect(() => {
    (async () => {
      const settings = await readSettings();
      setFirstBootDone(settings.first_boot_done ?? false);
      setLayout(settings.layout ?? "LayoutA");
      setTheme(settings.theme ?? "dark");
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

  // ---- Native OS context menu
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();

      const showMenu = async () => {
        const settings = await readSettings();
        const hasAI = getActiveProvider(settings.ai_providers, settings.active_ai_provider) !== null;

        const settingsItem = await MenuItem.new({
          text: "Settings",
          action: () => setView("settings"),
        });

        const searchItem = await MenuItem.new({
          text: "Search",
          action: () => setView("search"),
        });

        const separator = await PredefinedMenuItem.new({ item: "Separator" });
        const minimizeItem = await PredefinedMenuItem.new({ item: "Minimize" });
        const closeItem = await PredefinedMenuItem.new({ item: "CloseWindow" });

        let menu: Menu;
        if (hasAI) {
          const aiDjItem = await MenuItem.new({
            text: "AI DJ",
            action: () => setView("aidj"),
          });
          menu = await Menu.new({
            items: [settingsItem, searchItem, aiDjItem, separator, minimizeItem, closeItem],
          });
        } else {
          menu = await Menu.new({
            items: [settingsItem, searchItem, separator, minimizeItem, closeItem],
          });
        }
        await menu.popup(
          new LogicalPosition(e.clientX + 12, e.clientY),
          getCurrentWindow()
        );
      };

      void showMenu();
    };

    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  const handleDragStart = () => {
    getCurrentWindow().startDragging();
  };

  // ---- Splash screen while loading
  if (firstBootDone === null) {
    return (
      <div className="h-full w-full no-drag relative">
        <div className="drag-area" onMouseDown={handleDragStart} />
        <SplashScreen />
      </div>
    );
  }

  if (!firstBootDone) {
    return (
      <div className="h-full w-full no-drag relative theme-scope">
        <div className="drag-area" onMouseDown={handleDragStart} />
        <Boot
          initialStep={isReconnect ? "spotify-setup" : "provider"}
          onComplete={async () => {
            await writeSettings({
              first_boot_done: true,
              layout,
              theme,
              spotify: { access_token: null, refresh_token: null },
            });
            setFirstBootDone(true);
            setIsReconnect(false);
          }}
        />
      </div>
    );
  }

  // ---- Layout renderer
  const renderLayout = () => {
    if (layout === "LayoutB") return <LayoutB />;
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
          onResetAuth={() => {
            setIsReconnect(true);
            setFirstBootDone(false);
            setView("app");
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
    return renderLayout();
  };

  return (
    <div className="h-full w-full no-drag relative theme-scope">
      <div className="drag-area" onMouseDown={handleDragStart} />
      {renderView()}
    </div>
  );
}
