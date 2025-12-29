"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { CheckCircle2, Download, Github } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function DownloadSection() {
  const { t } = useLanguage();

  return (
    <section id="download" className="relative py-20 md:py-32">
      <div className="absolute inset-0 bg-linear-to-br from-[#1DB954]/5 via-transparent to-[#1ed760]/5" />

      <div className="container relative mx-auto px-4">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.h2 variants={item} className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {t.download.sectionTitle}
          </motion.h2>

          <motion.p variants={item} className="mb-12 text-lg text-muted-foreground">
            {t.download.sectionDescription}
          </motion.p>

          <motion.div variants={container} className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {["Windows", "macOS", "Linux"].map((os) => (
              <motion.div key={os} variants={item} whileHover={{ scale: 1.03 }} className="group relative overflow-hidden">
                <Card className="border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1DB954]/50">
                  <div className="mb-4 flex justify-center">
                    <div className="rounded-lg bg-[#1DB954]/10 p-4">
                      <svg className="h-12 w-12 text-[#1DB954]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M0 0h11.377v11.372H0zM12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zM12.623 12.623H24V24H12.623z" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="mb-2 text-2xl font-bold">{os}</h3>
                  <p className="mb-6 text-sm text-muted-foreground">
                    {os === "Windows" && t.download.windowsDescription}
                    {os === "macOS" && "macOS 11+ (Intel & Apple Silicon)"}
                    {os === "Linux" && t.download.linuxDescription}
                  </p>
                  <Button
                    className="w-full bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
                    size="lg"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    {t.download.downloadButton}
                  </Button>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={item} className="mb-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-[#1DB954]" />
            <span>
              {t.download.latestVersion}: <strong className="text-foreground">v0.1.0</strong> (28.10.2025)
            </span>
          </motion.div>

          <motion.div variants={item} className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button variant="outline" size="lg" asChild>
              <Link href="/download">{t.download.viewReleases}</Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <a href="https://github.com/ModioStudio/MiniFy" target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-5 w-5" />
                {t.hero.githubButton}
              </a>
            </Button>
          </motion.div>

          <motion.p variants={item} className="mt-8 text-sm text-muted-foreground">
            {t.download.systemRequirements}{" "}
            <Link href="/download" className="font-medium text-[#1DB954] hover:underline">
              {t.download.learnMore}
            </Link>
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}
