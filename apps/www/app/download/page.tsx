"use client";

import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import {
  CheckCircle2,
  Cpu,
  Download,
  Github,
  HardDrive,
  MonitorSmartphone,
  Terminal,
} from "lucide-react";

export default function DownloadPage() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            {t.downloadPage.title}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t.downloadPage.subtitle}
          </p>
        </div>

        {/* Download Cards */}
        <div className="mx-auto mb-16 grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Windows */}
          <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm">
            <div className="mb-6 flex items-start justify-between">
              <div className="rounded-lg bg-[#1DB954]/10 p-4">
                <svg
                  className="h-12 w-12 text-[#1DB954]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M0 0h11.377v11.372H0zM12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zM12.623 12.623H24V24H12.623z" />
                </svg>
              </div>
              <span className="rounded-full bg-[#1DB954]/10 px-3 py-1 text-xs font-medium text-[#1DB954]">
                {t.downloadPage.recommended}
              </span>
            </div>

            <h2 className="mb-3 text-3xl font-bold">{t.downloadPage.windows.title}</h2>
            <p className="mb-6 text-muted-foreground">
              {t.downloadPage.windows.description}
            </p>

            <div className="mb-6 space-y-3">
              {t.downloadPage.windows.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[#1DB954]" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Button
                className="w-full bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                MiniFy-Setup-v0.1.0.exe
              </Button>
              <Button
                variant="outline"
                className="w-full bg-transparent"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                MiniFy-v0.1.0-portable.zip
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              {t.downloadPage.windows.size}
            </p>
          </Card>

          {/* macOS */}
          <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm">
            <div className="mb-6 flex items-start justify-between">
              <div className="rounded-lg bg-[#1DB954]/10 p-4">
                <svg
                  className="h-12 w-12 text-[#1DB954]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
              </div>
            </div>

            <h2 className="mb-3 text-3xl font-bold">{t.downloadPage.macos.title}</h2>
            <p className="mb-6 text-muted-foreground">
              {t.downloadPage.macos.description}
            </p>

            <div className="mb-6 space-y-3">
              {t.downloadPage.macos.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[#1DB954]" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Button
                className="w-full bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                MiniFy-v0.1.0-universal.dmg
              </Button>
              <Button
                variant="outline"
                className="w-full bg-transparent"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                MiniFy-v0.1.0-arm64.dmg
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              {t.downloadPage.macos.size}
            </p>
          </Card>

          {/* Linux */}
          <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm">
            <div className="mb-6 flex items-start justify-between">
              <div className="rounded-lg bg-[#1ed760]/10 p-4">
                <svg
                  className="h-12 w-12 text-[#1ed760]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.835-.41 1.719-.41 2.626 0 .921.131 1.809.393 2.64.524 1.601 1.459 2.964 2.813 4.035.524.415 1.034.708 1.575.91.54.2 1.064.291 1.575.291.946 0 1.575-.291 1.575-.291.262 0 .524.131.786.393.262.262.393.524.393.786 0 .262-.131.524-.393.786-.262.262-.524.393-.786.393 0 0-.786.393-1.575.393-.655 0-1.247-.131-1.772-.393-.524-.262-1.034-.655-1.575-1.05-1.354-1.051-2.289-2.408-2.813-4.035-.262-.835-.393-1.719-.393-2.64 0-.921.131-1.809.393-2.64.589-1.772 1.831-3.47 2.716-4.521.75-1.067.974-1.928 1.05-3.02.065-1.491-.944-5.965 3.17-6.298.165-.013.325-.021.48-.021z" />
                </svg>
              </div>
            </div>

            <h2 className="mb-3 text-3xl font-bold">{t.downloadPage.linux.title}</h2>
            <p className="mb-6 text-muted-foreground">
              {t.downloadPage.linux.description}
            </p>

            <div className="mb-6 space-y-3">
              {t.downloadPage.linux.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-[#1ed760]" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3 -mt-6">
              <Button
                className="w-full bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                minify_0.1.0_amd64.deb
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  .rpm
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  AppImage
                </Button>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              {t.downloadPage.linux.size}
            </p>
          </Card>
        </div>

        {/* Version Info */}
        <Card className="mx-auto mb-16 max-w-5xl border-border/40 bg-card/50 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[#1DB954]/10 p-2">
                <CheckCircle2 className="h-6 w-6 text-[#1DB954]" />
              </div>
              <div>
                <div className="font-semibold">{t.downloadPage.latestVersion}: v0.1.0</div>
                <div className="text-sm text-muted-foreground">
                  {t.downloadPage.releasedOn} 28. Oktober 2025
                </div>
              </div>
            </div>
            <Button variant="ghost" asChild>
              <a
                href="https://github.com/ModioStudio/MiniFy/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="mr-2 h-5 w-5" />
                {t.downloadPage.allReleases}
              </a>
            </Button>
          </div>
        </Card>

        {/* System Requirements */}
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-3xl font-bold">
            {t.downloadPage.systemRequirements}
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/40 bg-card/50 p-6 backdrop-blur-sm">
              <div className="mb-4 inline-flex rounded-lg bg-[#1DB954]/10 p-3">
                <MonitorSmartphone className="h-6 w-6 text-[#1DB954]" />
              </div>
              <h3 className="mb-2 font-semibold">{t.downloadPage.requirements.os}</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Windows 10/11</li>
                <li>macOS 11+</li>
                <li>Ubuntu 20.04+</li>
                <li>Debian 11+</li>
                <li>Fedora 35+</li>
              </ul>
            </Card>

            <Card className="border-border/40 bg-card/50 p-6 backdrop-blur-sm">
              <div className="mb-4 inline-flex rounded-lg bg-[#1ed760]/10 p-3">
                <Cpu className="h-6 w-6 text-[#1ed760]" />
              </div>
              <h3 className="mb-2 font-semibold">{t.downloadPage.requirements.cpu}</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>64-bit CPU</li>
                <li>Dual-Core+</li>
                <li>1.5 GHz+</li>
              </ul>
            </Card>

            <Card className="border-border/40 bg-card/50 p-6 backdrop-blur-sm">
              <div className="mb-4 inline-flex rounded-lg bg-[#1DB954]/10 p-3">
                <HardDrive className="h-6 w-6 text-[#1DB954]" />
              </div>
              <h3 className="mb-2 font-semibold">{t.downloadPage.requirements.ram}</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>{t.downloadPage.requirements.minRam}</li>
                <li>{t.downloadPage.requirements.recRam}</li>
                <li>{t.downloadPage.requirements.usage}</li>
              </ul>
            </Card>

            <Card className="border-border/40 bg-card/50 p-6 backdrop-blur-sm">
              <div className="mb-4 inline-flex rounded-lg bg-[#1ed760]/10 p-3">
                <Terminal className="h-6 w-6 text-[#1ed760]" />
              </div>
              <h3 className="mb-2 font-semibold">{t.downloadPage.requirements.other}</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>{t.downloadPage.requirements.internet}</li>
                <li>{t.downloadPage.requirements.spotifyAccount}</li>
                <li>{t.downloadPage.requirements.storage}</li>
              </ul>
            </Card>
          </div>
        </div>

        {/* Installation Instructions */}
        <div className="mx-auto mt-16 max-w-5xl">
          <h2 className="mb-8 text-center text-3xl font-bold">
            {t.downloadPage.installation}
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-border/40 bg-card/50 p-8 backdrop-blur-sm">
              <h3 className="mb-4 text-xl font-bold">{t.downloadPage.windows.title}</h3>
              <ol className="space-y-3 text-sm text-muted-foreground">
                {t.downloadPage.installSteps.windows.map((step, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#1DB954]/10 text-xs font-semibold text-[#1DB954]">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </Card>

            <Card className="border-border/40 bg-card/50 p-8 backdrop-blur-sm">
              <h3 className="mb-4 text-xl font-bold">{t.downloadPage.macos.title}</h3>
              <ol className="space-y-3 text-sm text-muted-foreground">
                {t.downloadPage.installSteps.macos.map((step, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#1DB954]/10 text-xs font-semibold text-[#1DB954]">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </Card>

            <Card className="border-border/40 bg-card/50 p-8 backdrop-blur-sm">
              <h3 className="mb-4 text-xl font-bold">{t.downloadPage.linux.title}</h3>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">
                    {t.downloadPage.installSteps.linux.deb}
                  </p>
                  <code className="block rounded-md bg-muted p-3 text-xs">
                    sudo dpkg -i minify_0.1.0_amd64.deb
                  </code>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">
                    {t.downloadPage.installSteps.linux.rpm}
                  </p>
                  <code className="block rounded-md bg-muted p-3 text-xs">
                    sudo rpm -i minify-0.1.0.x86_64.rpm
                  </code>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">{t.downloadPage.installSteps.linux.appimage}</p>
                  <code className="block rounded-md bg-muted p-3 text-xs">
                    chmod +x MiniFy-0.1.0.AppImage
                    <br />
                    ./MiniFy-0.1.0.AppImage
                  </code>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="mx-auto mt-16 max-w-3xl text-center">
          <Card className="border-border/40 bg-card/50 p-8 backdrop-blur-sm">
            <h3 className="mb-3 text-2xl font-bold">{t.downloadPage.help.title}</h3>
            <p className="mb-6 text-muted-foreground">
              {t.downloadPage.help.description}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button variant="outline" asChild>
                <a
                  href="https://github.com/ModioStudio/MiniFy/wiki"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.downloadPage.help.docs}
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a
                  href="https://github.com/ModioStudio/MiniFy/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="mr-2 h-4 w-4" />
                  {t.downloadPage.help.issues}
                </a>
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
