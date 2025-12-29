"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { GitFork, Heart, Star, Users } from "lucide-react";
import { motion } from "framer-motion";
import { ContributorsRow } from "./ContributorRow";

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function OpenSourceSection() {
  const { t } = useLanguage();

  const stats = [
    { icon: Star, label: t.opensource.stars, value: "4+" },
    { icon: GitFork, label: t.opensource.forks, value: "0+" },
    { icon: Users, label: t.opensource.contributors, value: "2+" },
  ];

  return (
    <section
      id="opensource"
      className="relative overflow-hidden py-20 md:py-32"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-muted/50 dark:bg-black/90" />


      <div className="container relative mx-auto px-4">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="mx-auto flex max-w-4xl flex-col items-center text-center"
        >
          {/* Badge */}
          <motion.div
            variants={item}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/50 px-4 py-2 backdrop-blur-sm"
          >
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
            <span className="text-sm font-medium">Open Source</span>
          </motion.div>

          {/* Title */}
          <motion.h2
            variants={item}
            className="mb-6 bg-linear-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-5xl"
          >
            {t.opensource.title}
          </motion.h2>

          {/* Description */}
          <motion.p
            variants={item}
            className="mb-16 max-w-3xl text-lg text-muted-foreground text-balance"
          >
            {t.opensource.description}
          </motion.p>

          {/* STATS + CONTRIBUTORS – ONE GRID */}
          <motion.div
            variants={container}
            className="mb-16 grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3"
          >
            {/* Stats */}
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  variants={item}
                  whileHover={{ scale: 1.04 }}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-border/40 bg-muted/40 px-6 py-8 backdrop-blur-sm transition-colors hover:bg-muted/60"
                >
                  <Icon className="h-7 w-7 text-primary transition-transform group-hover:scale-110" />
                  <span className="text-3xl font-bold tracking-tight">
                    {stat.value}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                </motion.div>
              );
            })}

            {/* Contributors – spans all columns */}
          </motion.div>

          <motion.div
            variants={item}
            className="flex justify-center mb-10"
          >
            <ContributorsRow />
          </motion.div>

          {/* Actions */}
          <motion.div
            variants={item}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              size="lg"
              className="group bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
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
          </motion.div>

          {/* License */}
          <motion.p
            variants={item}
            className="mt-12 text-sm text-muted-foreground"
          >
            {t.opensource.license}{" "}
            <a
              href="https://github.com/ModioStudio/MiniFy/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              MIT License
            </a>
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
