"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { Layout, Lock, Music, Palette, Settings, Zap } from "lucide-react";

export function FeaturesSection() {
  const { t } = useLanguage();

  const features = [
    {
      icon: Music,
      title: t.features.spotify.title,
      description: t.features.spotify.description,
      gradient: "from-[#1DB954] to-[#1ed760]",
    },
    {
      icon: Layout,
      title: t.features.layouts.title,
      description: t.features.layouts.description,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      icon: Palette,
      title: t.features.themes.title,
      description: t.features.themes.description,
      gradient: "from-purple-500 to-pink-500",
    },
    {
      icon: Zap,
      title: t.features.performance.title,
      description: t.features.performance.description,
      gradient: "from-yellow-500 to-orange-500",
    },
    {
      icon: Lock,
      title: t.features.secure.title,
      description: t.features.secure.description,
      gradient: "from-red-500 to-rose-500",
    },
    {
      icon: Settings,
      title: t.features.customizable.title,
      description: t.features.customizable.description,
      gradient: "from-teal-500 to-emerald-500",
    },
  ];

  return (
    <section id="features" className="py-20 md:py-32">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
            {t.features.sectionTitle}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-balance">
            {t.features.sectionDescription}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className="group relative overflow-hidden border-border/40 bg-card/50 backdrop-blur-sm transition-all hover:shadow-lg"
              >
                <CardContent className="p-6">
                  <div
                    className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${feature.gradient} shadow-lg`}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
