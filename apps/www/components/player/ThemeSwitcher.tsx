"use client";

import { ChevronDown } from "lucide-react";
import type { ThemeMeta, LayoutType } from "@/lib/types/theme";

type ThemeSwitcherProps = {
  themes: ThemeMeta[];
  layouts: LayoutType[];
  currentTheme: string;
  currentLayout: LayoutType;
  onThemeChange: (themeId: string) => void;
  onLayoutChange: (layout: LayoutType) => void;
};

export function ThemeSwitcher({
  themes,
  layouts,
  currentTheme,
  currentLayout,
  onThemeChange,
  onLayoutChange,
}: ThemeSwitcherProps) {
  const currentThemeMeta = themes.find((t) => t.id === currentTheme);

  return (
    <div className="flex items-center gap-3 flex-wrap justify-center">
      <div className="relative">
        <select
          value={currentTheme}
          onChange={(e) => onThemeChange(e.target.value)}
          className="appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 pr-10 text-sm text-white/90 cursor-pointer hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1DB954]/50"
        >
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id} className="bg-[#121212] text-white">
              {theme.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
      </div>

      <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
        {layouts.map((layout) => (
          <button
            key={layout}
            type="button"
            onClick={() => onLayoutChange(layout)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              currentLayout === layout
                ? "bg-[#1DB954] text-white shadow-md"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            Layout {layout}
          </button>
        ))}
      </div>
    </div>
  );
}

