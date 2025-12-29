"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import { LANGUAGES, type Language } from "@/lib/translations";
import { BookOpen, Globe, Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.minify.modio.studio";

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentLanguage = LANGUAGES.find((l) => l.code === language);

  const handleMobileNav = (target: string) => {
    const element = document.querySelector(target);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setMobileMenuOpen(false);
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="logo" className="w-32 h-32 dark:invert-0 invert" />
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
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium transition-colors hover:text-primary inline-flex items-center gap-1"
          >
            <BookOpen className="h-4 w-4" />
            {t.nav.docs}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="hidden sm:flex gap-2">
                <Globe className="h-4 w-4" />
                <span className="text-sm">{currentLanguage?.code.toUpperCase()}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`cursor-pointer ${language === lang.code ? "bg-accent" : ""}`}
                >
                  <span className="w-8 text-muted-foreground">{lang.code.toUpperCase()}</span>
                  <span>{lang.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
              className="text-sm font-medium transition-colors hover:text-primary text-left"
              onClick={() => handleMobileNav("#features")}
            >
              {t.nav.features}
            </button>
            <button
              type="button"
              className="text-sm font-medium transition-colors hover:text-primary text-left"
              onClick={() => handleMobileNav("#download")}
            >
              {t.nav.download}
            </button>
            <button
              type="button"
              className="text-sm font-medium transition-colors hover:text-primary text-left"
              onClick={() => handleMobileNav("#opensource")}
            >
              {t.nav.opensource}
            </button>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium transition-colors hover:text-primary inline-flex items-center gap-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              <BookOpen className="h-4 w-4" />
              {t.nav.docs}
            </a>
            <a
              href="https://github.com/ModioStudio/MiniFy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium transition-colors hover:text-primary"
              onClick={() => setMobileMenuOpen(false)}
            >
              GitHub
            </a>
            <div className="border-t border-border/40 pt-4">
              <p className="text-xs text-muted-foreground mb-2">Language</p>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((lang) => (
                  <Button
                    key={lang.code}
                    variant={language === lang.code ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      handleLanguageChange(lang.code);
                      setMobileMenuOpen(false);
                    }}
                    className="justify-start"
                  >
                    <span className="text-xs">{lang.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
