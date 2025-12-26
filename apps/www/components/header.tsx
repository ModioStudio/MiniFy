"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleMobileNav = (target: string) => {
    const element = document.querySelector(target);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-[#1DB954] to-[#1ed760]">
            <span className="text-lg font-bold text-white">M</span>
          </div>
          <span className="text-xl font-bold">MiniFy</span>
        </div>

        <nav className="hidden items-center gap-6 md:flex">
          <a href="/#features" className="text-sm font-medium transition-colors hover:text-primary">
            {t.nav.features}
          </a>
          <a href="/#download" className="text-sm font-medium transition-colors hover:text-primary">
            {t.nav.download}
          </a>
          <a
            href="/#opensource"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            {t.nav.opensource}
          </a>
          <a
            href="https://github.com/ModioStudio/MiniFy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLanguage(language === "en" ? "de" : "en")}
            className="hidden sm:flex"
          >
            <span className="text-sm font-medium">{language === "en" ? "DE" : "EN"}</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-xl md:hidden">
          <nav className="container mx-auto flex flex-col gap-4 px-4 py-4">
            <button
              type="button"
              className="text-sm font-medium transition-colors hover:text-primary"
              onClick={() => handleMobileNav("#features")}
            >
              {t.nav.features}
            </button>
            <button
              type="button"
              className="text-sm font-medium transition-colors hover:text-primary"
              onClick={() => handleMobileNav("#download")}
            >
              {t.nav.download}
            </button>
            <button
              type="button"
              className="text-sm font-medium transition-colors hover:text-primary"
              onClick={() => handleMobileNav("#opensource")}
            >
              {t.nav.opensource}
            </button>
            <a
              href="https://github.com/ModioStudio/MiniFy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium transition-colors hover:text-primary"
              onClick={() => setMobileMenuOpen(false)}
            >
              GitHub
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLanguage(language === "en" ? "de" : "en");
                setMobileMenuOpen(false);
              }}
              className="w-fit"
            >
              {language === "en" ? "Deutsch" : "English"}
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
