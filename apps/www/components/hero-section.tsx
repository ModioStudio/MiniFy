"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { ArrowRight, Download, Github } from "lucide-react";

export function HeroSection() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1DB954]/10 via-transparent to-[#1ed760]/10 dark:from-[#1DB954]/5 dark:to-[#1ed760]/5" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/50 px-4 py-2 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1DB954] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1DB954]" />
            </span>
            <span className="text-sm font-medium">{t.hero.badge}</span>
          </div>

          <h1 className="mb-6 bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-5xl font-bold tracking-tight text-transparent text-balance md:text-7xl">
            {t.hero.title}
          </h1>

          <p className="mb-10 text-lg text-muted-foreground text-balance md:text-xl">
            {t.hero.description}
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              className="group bg-gradient-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
              asChild
            >
              <a href="#download">
                <Download className="mr-2 h-5 w-5" />
                {t.hero.downloadButton}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a
                href="https://github.com/ModioStudio/MiniFy"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="mr-2 h-5 w-5" />
                {t.hero.githubButton}
              </a>
            </Button>
          </div>

          <div className="mt-16">
            <div className="relative mx-auto max-w-5xl rounded-xl border border-border/40 bg-gradient-to-br from-muted/30 to-muted/10 p-2 shadow-2xl backdrop-blur-sm">
              <img
                src="https://github.com/ModioStudio/MiniFy/raw/main/.docs/assets/layouta.png"
                alt="MiniFy Screenshot"
                className="w-full rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
