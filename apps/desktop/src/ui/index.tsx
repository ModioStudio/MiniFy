import { useEffect, useRef, useState } from "react";
import "./global.css";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import LayoutA from "./layouts/LayoutA";
import LayoutB from "./layouts/LayoutB";
import LayoutC from "./layouts/LayoutC";
import { readSettings, writeSettings } from "./settingLib";
import { applyThemeByName } from "./themeLoader";
import Boot from "./views/Boot";
import Settings from "./views/Settings.tsx";

export default function App() {
  const [firstBootDone, setFirstBootDone] = useState<boolean | null>(null);
  const [layout, setLayout] = useState<string>("LayoutA");
  const [theme, setTheme] = useState<string>("dark");
  const [view, setView] = useState<"app" | "settings">("app");
  const nativeMenuRef = useRef<Menu | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const settings = await readSettings();
      setFirstBootDone(settings.first_boot_done || false);
      setLayout(settings.layout || "LayoutA");
      setTheme(settings.theme || "dark");
    }
    loadSettings();
  }, []);

  useEffect(() => {
    applyThemeByName(theme);
  }, [theme]);

  // Global context menu (native OS popup)
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      const buildAndShow = async () => {
        if (!nativeMenuRef.current) {
          const settingsItem = await MenuItem.new({
            text: "Settings",
            action: () => setView("settings"),
          });
          const debugItem = await MenuItem.new({
            text: "Debug",
            action: () => {
              void invoke("open_webview_devtools");
            },
          });
          const sep = await PredefinedMenuItem.new({ item: "Separator" });
          const minimizeItem = await PredefinedMenuItem.new({ item: "Minimize", text: "Minimize" });
          const maximizeItem = await PredefinedMenuItem.new({ item: "Maximize", text: "Maximize" });
          const closeItem = await PredefinedMenuItem.new({ item: "CloseWindow", text: "Close" });
          nativeMenuRef.current = await Menu.new({
            items: [settingsItem, debugItem, sep, minimizeItem, maximizeItem, closeItem],
          });
        }
        const menu = nativeMenuRef.current;
        if (!menu) return;
        await menu.popup(new LogicalPosition(e.clientX + 12, e.clientY), getCurrentWindow());
      };
      void buildAndShow();
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  if (firstBootDone === null) return <div>Loading...</div>;

  if (!firstBootDone)
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

  const appContent = (() => {
    switch (layout) {
      case "LayoutA":
        return <LayoutA />;
      case "LayoutB":
        return <LayoutB />;
      case "LayoutC":
        return <LayoutC />;
      default:
        return <LayoutA />;
    }
  })();

  return (
    <div className="h-full w-full no-drag relative theme-scope">
      <div className="drag-area" />
      {view === "settings" ? (
        <Settings
          onBack={() => setView("app")}
          onUpdateLayout={(l) => setLayout(l)}
          onUpdateTheme={(t) => setTheme(t)}
        />
      ) : (
        appContent
      )}
    </div>
  );
}
