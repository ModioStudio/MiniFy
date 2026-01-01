"use client";

import type { LayoutType, ThemeMeta } from "@/lib/types/theme";
import { ChevronDown } from "lucide-react";

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
          className="appearance-none bg-muted border border-border rounded-lg px-4 py-2 pr-10 text-sm text-foreground cursor-pointer hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-[#1DB954]/50"
        >
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id} className="bg-popover text-popover-foreground">
              {theme.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>

      <div className="flex items-center gap-1 bg-muted border border-border rounded-lg p-1">
        {layouts.map((layout) => (
          <button
            key={layout}
            type="button"
            onClick={() => onLayoutChange(layout)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              currentLayout === layout
                ? "bg-[#1DB954] text-white shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            Layout {layout}
          </button>
        ))}
      </div>
    </div>
  );
}
