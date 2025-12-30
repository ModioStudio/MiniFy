"use client";

import { useLanguage } from "@/hooks/use-language";
import { DiscordLogoIcon } from "@phosphor-icons/react";
import { Github, Heart, Twitter } from "lucide-react";

export function Footer() {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="mb-4 flex items-center gap-3">
              <img
                src="/logo.png"
                alt="MiniFy Logo"
                className="h-9 w-9 dark:invert-0 invert"
              />
              <span className="text-xl font-bold tracking-tight">
                MiniFy
              </span>
            </div>

            <p className="mb-5 max-w-md text-sm text-muted-foreground">
              {t.footer.description}
            </p>

            <div className="flex items-center gap-4">
              <a
                href="https://github.com/ModioStudio/MiniFy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-transform hover:scale-110 hover:text-primary"
              >
                <Github className="h-5 w-5" />
              </a>

              <a
                href="https://twitter.com/modiostudio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-transform hover:scale-110 hover:text-primary"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="https://discord.gg/P3meTq3trF"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-transform hover:scale-110 hover:text-primary"
              >
                <DiscordLogoIcon className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="mb-4 text-sm font-semibold">
              {t.footer.product}
            </h3>
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

          {/* Community */}
          <div>
            <h3 className="mb-4 text-sm font-semibold">
              {t.footer.community}
            </h3>
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

        {/* Bottom */}
        <div className="mt-14 border-t border-border/40 pt-8 text-center text-sm text-muted-foreground">
          <p className="flex items-center justify-center gap-1">
            {t.footer.madeWith}
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
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
