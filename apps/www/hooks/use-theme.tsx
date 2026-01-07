"use client";

import { useCallback, useEffect, useState } from "react";
import { COOKIE_NAMES, getCookie, setCookie } from "@/lib/cookies";

export type Theme = "light" | "dark";

function getBrowserTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(): Theme {
  const cookieTheme = getCookie(COOKIE_NAMES.THEME) as Theme | null;
  if (cookieTheme && (cookieTheme === "light" || cookieTheme === "dark")) {
    return cookieTheme;
  }
  return getBrowserTheme();
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme(): {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const initialTheme = getInitialTheme();
    setThemeState(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    setCookie(COOKIE_NAMES.THEME, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  }, [theme, setTheme]);

  return { theme, toggleTheme, setTheme };
}
