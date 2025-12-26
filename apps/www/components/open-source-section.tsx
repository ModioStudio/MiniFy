"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { GitFork, Heart, Star, Users } from "lucide-react";

export function OpenSourceSection() {
  const { t } = useLanguage();

  const stats = [
    { icon: Star, label: t.opensource.stars, value: "4+" },
    { icon: GitFork, label: t.opensource.forks, value: "0+" },
    { icon: Users, label: t.opensource.contributors, value: "2+" },
  ];

  return (
    <section id="opensource" className="relative py-20 md:py-32">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-pink-500/5" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 px-4 py-2 backdrop-blur-sm">
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
            <span className="text-sm font-medium">Open Source</span>
          </div>

          <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
            {t.opensource.title}
          </h2>
          <p className="mb-12 text-lg text-muted-foreground text-balance">
            {t.opensource.description}
          </p>

          <div className="mb-12 grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} className="border-border/40 bg-card/50 backdrop-blur-sm">
                  <CardContent className="flex flex-col items-center gap-2 p-6">
                    <Icon className="h-8 w-8 text-primary" />
                    <div className="text-3xl font-bold">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-pink-500 hover:to-purple-500"
              asChild
            >
              <a
                href="https://github.com/ModioStudio/MiniFy"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Star className="mr-2 h-5 w-5" />
                {t.opensource.starButton}
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a
                href="https://github.com/ModioStudio/MiniFy/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Users className="mr-2 h-5 w-5" />
                {t.opensource.contributeButton}
              </a>
            </Button>
          </div>

          <div className="mt-12">
            <p className="text-sm text-muted-foreground">
              {t.opensource.license}{" "}
              <a
                href="https://github.com/ModioStudio/MiniFy/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                MIT License
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
