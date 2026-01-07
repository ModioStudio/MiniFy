"use client";

import { motion } from "framer-motion";
import { ArrowRight, Download, Github } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { PlayerPreview } from "./player";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export function HeroSection() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      <div className="absolute inset-0 bg-linear-to-br from-[#1DB954]/10 via-transparent to-[#1ed760]/10 dark:from-[#1DB954]/5 dark:to-[#1ed760]/5" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/50 px-4 py-2 backdrop-blur-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1DB954] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1DB954]" />
            </span>
            <span className="text-sm font-medium">{t.hero.badge}</span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
            className="md:-mt-15 mb-6 bg-linear-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl md:text-7xl text-center"
          >
            <span>{t.hero.titleBefore} </span>

            <span className="inline-flex items-baseline whitespace-nowrap">
              <span>Sp</span>

              <Image
                src="/logo.png"
                alt=""
                aria-hidden="true"
                width={80}
                height={80}
                className="
                  -mx-4
                  h-[1.6em] w-[1.6em]
                  translate-y-[0.55em]
                  dark:invert-0 invert

                  sm:-mx-6
                  sm:h-[1.9em] sm:w-[1.9em]
                  sm:translate-y-[0.65em]

                  md:-mx-10
                  md:h-[2.0em] md:w-[2.0em]
                  md:translate-y-[0.75em]
                "
              />

              <span>tify</span>
            </span>

            <span>{t.hero.titleAfter}</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="mb-10 text-lg text-muted-foreground md:text-xl"
          >
            {t.hero.description}
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              size="lg"
              className="group bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
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
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.7, delay: 0.45, ease: "easeOut" }}
            className="mt-16 flex justify-center"
          >
            <PlayerPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
