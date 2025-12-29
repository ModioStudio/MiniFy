"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";

const contributors = [
  {
    name: "Jaron",
    avatar: "https://github.com/J4ron.png",
    url: "https://github.com/J4ron",
  },
  {
    name: "Skeptic-systems",
    avatar: "https://github.com/Skeptic-systems.png",
    url: "https://github.com/Skeptic-systems",
  },
  {
    name: "redasnkrs",
    avatar: "https://github.com/redasnkrs.png",
    url: "https://github.com/redasnkrs",
  },
];

export function ContributorsRow() {
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="mt-10 flex flex-col items-center gap-4"
    >
      <p className="text-sm text-muted-foreground">{t.opensource.contributors}</p>

      <div className="flex items-center -space-x-3">
        {contributors.map((c) => (
          <a
            key={c.name}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative transition-transform hover:z-10 hover:scale-110"
          >
            <img
              src={c.avatar}
              alt={c.name}
              className="h-10 w-10 rounded-full border border-border bg-background"
            />
          </a>
        ))}

        <a
          href="https://github.com/ModioStudio/MiniFy/graphs/contributors"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-4 text-sm text-primary hover:underline"
        >
          {t.opensource.viewAll}
        </a>
      </div>
    </motion.div>
  );
}
