"use client";

import { Card } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { Layout, Lock, Palette, Sliders, SpotifyLogoIcon } from "@phosphor-icons/react";
import { Zap } from "lucide-react";
import { useState } from "react";

export function FeaturesSection() {
  const { t } = useLanguage();

  const [spotifyConnected, setSpotifyConnected] = useState(true);
  const [activeLayout, setActiveLayout] = useState<"A" | "B" | "C">("A");
  const [activeTheme, setActiveTheme] = useState(0);

  const layouts = {
    A: { bar: "1/3", dots: 1, color: "#1DB954" },
    B: { bar: "2/3", dots: 3, color: "#1ed760" },
    C: { bar: "full", dots: 5, color: "#00bfff" },
  };

  const themes = [
    { colors: ["#1DB954", "#1ed760"] },
    { colors: ["#9b5de5", "#f15bb5"] },
    { colors: ["#3b82f6", "#06b6d4"] },
  ];

  return (
    <section className="py-20 md:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t.features.sectionTitle}
          </h2>
          <p className="text-lg text-muted-foreground">{t.features.sectionDescription}</p>
        </div>

        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1DB954]/50 md:col-span-2 lg:col-span-2">
            <div className="mb-6 inline-flex rounded-lg bg-[#1DB954]/10 p-3">
              <Lock className="h-6 w-6 text-[#1DB954]" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.features.spotify.title}</h3>
            <p className="mb-8 text-muted-foreground">{t.features.spotify.description}</p>

            <div className="relative rounded-lg border border-border/40 bg-background/50 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954]">
                  <SpotifyLogoIcon className="h-8 w-8 text-white" weight="fill" />
                </div>
                <div className="flex-1">
                  <div
                    className={`mb-1 h-3 w-32 rounded ${
                      spotifyConnected ? "bg-[#1DB954]" : "bg-muted"
                    }`}
                  />
                  <div
                    className={`h-2 w-24 rounded ${
                      spotifyConnected ? "bg-[#1ed760]" : "bg-muted/60"
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSpotifyConnected(!spotifyConnected)}
                  className="flex items-center gap-1"
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      spotifyConnected ? "bg-[#1DB954] animate-pulse" : "bg-muted"
                    }`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {spotifyConnected ? "Connected" : "Disconnected"}
                  </span>
                </button>
              </div>

              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-muted/30 p-3 hover:bg-[#1DB954]/10 transition-colors cursor-pointer"
                  >
                    <div className="h-8 w-8 rounded bg-[#1DB954]/20" />
                    <div className="flex-1 space-y-1">
                      <div className="h-2.5 w-3/4 rounded bg-muted" />
                      <div className="h-2 w-1/2 rounded bg-muted/60" />
                    </div>
                    <div className="flex gap-1">
                      <div className="h-7 w-7 rounded-md border border-border/40 bg-background/50 flex items-center justify-center">
                        <div className="h-0 w-0 border-y-4 border-l-6 border-y-transparent border-l-[#1DB954]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1ed760]/50">
            <div className="mb-6 inline-flex rounded-lg bg-[#1ed760]/10 p-3">
              <Layout className="h-6 w-6 text-[#1ed760]" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.features.layouts.title}</h3>
            <p className="mb-8 text-muted-foreground">{t.features.layouts.description}</p>

            <div className="space-y-3">
              <div className="flex gap-2">
                {Object.keys(layouts).map((layout) => (
                  <button
                    type="button"
                    key={layout}
                    onClick={() => setActiveLayout(layout as keyof typeof layouts)}
                    className={`flex-1 rounded-md border-2 p-3 text-xs font-medium transition-colors ${
                      activeLayout === layout
                        ? `border-[${layouts[layout as keyof typeof layouts].color}] bg-[${
                            layouts[layout as keyof typeof layouts].color
                          }]/20`
                        : "border-border/40 bg-background/50 hover:border-[#1DB954]/30"
                    }`}
                  >
                    Layout {layout}
                  </button>
                ))}
              </div>

              <div className="rounded-lg border border-border/40 bg-background/50 p-4 backdrop-blur-sm transition-all">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-12 w-12 rounded bg-[color:var(--mock-color)]/20 transition-colors" />
                  <div className="flex-1">
                    <div className="mb-1.5 h-2.5 w-3/4 rounded bg-muted" />
                    <div className="h-2 w-1/2 rounded bg-muted/60" />
                  </div>
                </div>

                <div className="mb-3 h-1 rounded-full bg-muted">
                  <div
                    className={`h-full w-${layouts[activeLayout].bar} rounded-full transition-all`}
                    style={{ backgroundColor: layouts[activeLayout].color }}
                  />
                </div>

                <div className="flex justify-center gap-3">
                  {[...Array(layouts[activeLayout].dots)].map((_, i) => (
                    <div
                      key={i}
                      className="h-6 w-6 rounded-full border border-border/40"
                      style={{ backgroundColor: layouts[activeLayout].color }}
                    />
                  ))}
                  {[...Array(5 - layouts[activeLayout].dots)].map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="h-6 w-6 rounded-full border border-border/40 bg-background/50"
                    />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1DB954]/50">
            <div className="mb-6 inline-flex rounded-lg bg-[#1DB954]/10 p-3">
              <Palette className="h-6 w-6 text-[#1DB954]" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.features.themes.title}</h3>
            <p className="mb-8 text-muted-foreground">{t.features.themes.description}</p>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {themes.map((theme, i) => (
                  <div
                    key={i}
                    onClick={() => setActiveTheme(i)}
                    className={`aspect-square rounded-lg border-2 p-2 cursor-pointer ${
                      activeTheme === i ? "border-[#1DB954]" : "border-border/40 opacity-60"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[1]})`,
                    }}
                  />
                ))}
              </div>

              <div className="space-y-2 rounded-lg border border-border/40 bg-background/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Primary</span>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded border border-border/40 bg-[#1DB954]" />
                    <span className="text-xs font-mono">#1DB954</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Accent</span>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded border border-border/40 bg-[#1ed760]" />
                    <span className="text-xs font-mono">#1ed760</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1ed760]/50">
            <div className="mb-6 inline-flex rounded-lg bg-[#1ed760]/10 p-3">
              <Zap className="h-6 w-6 text-[#1ed760]" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.features.performance.title}</h3>
            <p className="mb-8 text-muted-foreground">{t.features.performance.description}</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/40 bg-background/50 p-3 hover:bg-[#1DB954]/10 transition-colors cursor-pointer">
                  <div className="mb-1 text-xs text-muted-foreground">CPU</div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-[#1DB954] animate-pulse">2.1</span>
                    <span className="mb-0.5 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-background/50 p-3 hover:bg-[#1ed760]/10 transition-colors cursor-pointer">
                  <div className="mb-1 text-xs text-muted-foreground">RAM</div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-[#1ed760] animate-pulse">45</span>
                    <span className="mb-0.5 text-xs text-muted-foreground">MB</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-background/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium">Startup</span>
                  <span className="text-xs font-mono text-[#1DB954]">{"<"}100ms</span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[15%] rounded-full bg-gradient-to-r from-[#1DB954] to-[#1ed760] animate-pulse" />
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-[#1DB954]/5 p-3">
                <Zap className="h-4 w-4 text-[#1DB954]" />
                <span className="text-xs font-medium">Powered by Tauri & Rust</span>
              </div>
            </div>
          </Card>

          <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1ed760]/50">
            <div className="mb-6 inline-flex rounded-lg bg-[#1ed760]/10 p-3">
              <Sliders className="h-6 w-6 text-[#1ed760]" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.features.customizable.title}</h3>
            <p className="mb-8 text-muted-foreground">{t.features.customizable.description}</p>

            <div className="space-y-3">
              <div className="rounded-lg border border-border/40 bg-background/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium">Keyboard Shortcuts</span>
                  <span className="text-xs text-muted-foreground">12 active</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "Play/Pause", key: "Space" },
                    { label: "Next Track", key: "→" },
                    { label: "Toggle Window", key: "Cmd+Shift+M" },
                  ].map((shortcut, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs hover:bg-[#1ed760]/10 p-1 rounded cursor-pointer transition-colors"
                    >
                      <span className="text-muted-foreground">{shortcut.label}</span>
                      <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#1DB954]/30 bg-[#1DB954]/5 p-3 text-center hover:bg-[#1DB954]/10 transition-colors cursor-pointer">
                  <div className="mb-2 flex justify-center">
                    <div className="rounded bg-[#1DB954]/10 p-2">
                      <Sliders className="h-4 w-4 text-[#1DB954]" />
                    </div>
                  </div>
                  <div className="text-xs font-medium">Draggable</div>
                </div>
                <div className="rounded-lg border border-[#1ed760]/30 bg-[#1ed760]/5 p-3 text-center hover:bg-[#1ed760]/10 transition-colors cursor-pointer">
                  <div className="mb-2 flex justify-center">
                    <div className="rounded bg-[#1ed760]/10 p-2">
                      <Sliders className="h-4 w-4 text-[#1ed760]" />
                    </div>
                  </div>
                  <div className="text-xs font-medium">Context Menu</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
