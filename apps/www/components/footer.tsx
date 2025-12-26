"use client";

import { useLanguage } from "@/hooks/use-language";
import { Github, Heart, Twitter } from "lucide-react";

export function Footer() {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-[#1DB954] to-[#1ed760]">
                <span className="text-lg font-bold text-white">M</span>
              </div>
              <span className="text-xl font-bold">MiniFy</span>
            </div>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">{t.footer.description}</p>
            <div className="flex gap-4">
              <a
                href="https://github.com/ModioStudio/MiniFy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                <Github className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                <Twitter className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold">{t.footer.product}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="#features"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {t.footer.features}
                </a>
              </li>
              <li>
                <a
                  href="#download"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {t.footer.download}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/ModioStudio/MiniFy/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {t.footer.releases}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold">{t.footer.community}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/ModioStudio/MiniFy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/ModioStudio/MiniFy/blob/main/CONTRIBUTING.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {t.footer.contributing}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/ModioStudio/MiniFy/blob/main/CODE_OF_CONDUCT.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {t.footer.codeOfConduct}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border/40 pt-8 text-center text-sm text-muted-foreground">
          <p className="flex items-center justify-center gap-1">
            {t.footer.madeWith} <Heart className="h-4 w-4 fill-red-500 text-red-500" />{" "}
            {t.footer.byTeam}
          </p>
          <p className="mt-2">
            © {currentYear} MiniFy. {t.footer.allRightsReserved}
          </p>
        </div>
      </div>
    </footer>
  );
}
