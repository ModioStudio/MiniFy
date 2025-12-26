import { useEffect, useRef, useState } from "react";
import "./global.css";

import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { readSettings, writeSettings } from "../lib/settingLib";
import { applyThemeByName } from "../loader/themeLoader";

import LayoutA from "./layouts/LayoutA";
import LayoutB from "./layouts/LayoutB";
import LayoutC from "./layouts/LayoutC";

import Boot from "./views/Boot";
import Settings from "./views/Settings";
import SearchBar from "./views/SearchBar";

type AppView = "app" | "settings" | "search";

export default function App() {
  const [firstBootDone, setFirstBootDone] = useState<boolean | null>(null);
  const [layout, setLayout] = useState<string>("LayoutA");
  const [theme, setTheme] = useState<string>("dark");
  const [view, setView] = useState<AppView>("app");

  const nativeMenuRef = useRef<Menu | null>(null);

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
    applyThemeByName(theme);
  }, [theme]);

  // ---- Native OS context menu
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();

      const showMenu = async () => {
        if (!nativeMenuRef.current) {
          const settingsItem = await MenuItem.new({
            text: "Settings",
            action: () => setView("settings"),
          });

          const searchItem = await MenuItem.new({
            text: "Search",
            action: () => setView("search"),
          });

          const debugItem = await MenuItem.new({
            text: "Debug",
            action: () => void invoke("open_webview_devtools"),
          });

          const separator = await PredefinedMenuItem.new({ item: "Separator" });
          const minimizeItem = await PredefinedMenuItem.new({ item: "Minimize" });
          const maximizeItem = await PredefinedMenuItem.new({ item: "Maximize" });
          const closeItem = await PredefinedMenuItem.new({ item: "CloseWindow" });

          nativeMenuRef.current = await Menu.new({
            items: [
              settingsItem,
              searchItem,
              debugItem,
              separator,
              minimizeItem,
              maximizeItem,
              closeItem,
            ],
          });
        }

        await nativeMenuRef.current.popup(
          new LogicalPosition(e.clientX + 12, e.clientY),
          getCurrentWindow()
        );
      };

      void showMenu();
    };

    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  // ---- Boot screen
  if (firstBootDone === null) {
    return <div>Loading...</div>;
  }

  if (!firstBootDone) {
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
  }

  // ---- Layout renderer
  const renderLayout = () => {
    switch (layout) {
      case "LayoutB":
        return <LayoutB />;
      case "LayoutC":
        return <LayoutC />;
      case "LayoutA":
      default:
        return <LayoutA />;
    }
  };

  // ---- View renderer (app / settings / search)
  const renderView = () => {
    switch (view) {
      case "settings":
        return (
          <Settings
            onBack={() => setView("app")}
            onUpdateLayout={setLayout}
            onUpdateTheme={setTheme}
          />
        );

      case "search":
        return <SearchBar />;

      case "app":
      default:
        return renderLayout();
    }
  };

  return (
    <div className="h-full w-full no-drag relative theme-scope">
      <div className="drag-area" />
      {renderView()}
    </div>
  );
}
