"use client";

import { DEFAULT_THEME, fetchAllThemes, fetchThemeIndex } from "@/lib/theme-loader";
import type { LayoutType, ThemeConfig, ThemeIndex } from "@/lib/types/theme";
import { useEffect, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { LayoutA, LayoutB, LayoutC } from "./layouts";

export function PlayerPreview() {
  const [themeIndex, setThemeIndex] = useState<ThemeIndex | null>(null);
  const [themes, setThemes] = useState<Map<string, ThemeConfig>>(new Map());
  const [currentThemeId, setCurrentThemeId] = useState<string>("light");
  const [currentLayout, setCurrentLayout] = useState<LayoutType>("B");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadThemes() {
      try {
        const index = await fetchThemeIndex();
        setThemeIndex(index);
        setCurrentThemeId(index.defaultTheme);
        setCurrentLayout(index.defaultLayout);

        const loadedThemes = await fetchAllThemes(index);
        setThemes(loadedThemes);
      } catch (error) {
        console.error("Failed to load themes:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadThemes();
  }, []);

  const currentTheme = themes.get(currentThemeId) ?? DEFAULT_THEME;

  const renderLayout = () => {
    switch (currentLayout) {
      case "A":
        return <LayoutA theme={currentTheme} />;
      case "B":
        return <LayoutB theme={currentTheme} />;
      case "C":
        return <LayoutC theme={currentTheme} />;
      default:
        return <LayoutB theme={currentTheme} />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="h-[200px] w-[400px] rounded-[18px] bg-muted animate-pulse" />
        <div className="h-10 w-64 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex justify-center">{renderLayout()}</div>

      {themeIndex && (
        <ThemeSwitcher
          themes={themeIndex.themes}
          layouts={themeIndex.layouts}
          currentTheme={currentThemeId}
          currentLayout={currentLayout}
          onThemeChange={setCurrentThemeId}
          onLayoutChange={setCurrentLayout}
        />
      )}
    </div>
  );
}
