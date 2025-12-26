"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { Download, ExternalLink, Github } from "lucide-react";
import { useEffect, useState } from "react";

interface Release {
  version: string;
  date: string;
  downloadUrl: {
    windows?: string;
    linux?: string;
  };
}

export function DownloadSection() {
  const { t } = useLanguage();
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://api.github.com/repos/ModioStudio/MiniFy/releases/latest")
      .then((res) => res.json())
      .then((data) => {
        const windowsAsset = data.assets?.find(
          (asset: { name: string }) => asset.name.includes(".exe") || asset.name.includes("windows")
        );
        const linuxAsset = data.assets?.find(
          (asset: { name: string }) =>
            asset.name.includes(".AppImage") || asset.name.includes("linux")
        );

        setRelease({
          version: data.tag_name || "v0.1.0",
          date: new Date(data.published_at).toLocaleDateString(),
          downloadUrl: {
            windows: windowsAsset?.browser_download_url,
            linux: linuxAsset?.browser_download_url,
          },
        });
      })
      .catch(() => {
        // Fallback if API fails
        setRelease({
          version: "v0.1.0",
          date: new Date().toLocaleDateString(),
          downloadUrl: {},
        });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="download" className="relative py-20 md:py-32">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-cyan-500/5" />

      <div className="container relative mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
            {t.download.sectionTitle}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-balance">
            {t.download.sectionDescription}
          </p>
        </div>

        {loading ? (
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground">{t.download.loading}</span>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#1DB954]/10 to-[#1ed760]/10 px-6 py-3 backdrop-blur-sm">
                <span className="text-sm font-medium text-muted-foreground">
                  {t.download.latestVersion}:
                </span>
                <span className="bg-gradient-to-r from-[#1DB954] to-[#1ed760] bg-clip-text text-lg font-bold text-transparent">
                  {release?.version}
                </span>
                <span className="text-sm text-muted-foreground">({release?.date})</span>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
                    <svg
                      className="h-8 w-8 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      role="img"
                      aria-labelledby="windows-download-title"
                    >
                      <title id="windows-download-title">Windows download icon</title>
                      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                    </svg>
                  </div>
                  <CardTitle>Windows</CardTitle>
                  <CardDescription>{t.download.windowsDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                  {release?.downloadUrl.windows ? (
                    <Button
                      size="lg"
                      className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-cyan-500 hover:to-blue-500"
                      asChild
                    >
                      <a href={release.downloadUrl.windows} download>
                        <Download className="mr-2 h-5 w-5" />
                        {t.download.downloadButton}
                      </a>
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline" className="w-full bg-transparent" asChild>
                      <a
                        href="https://github.com/ModioStudio/MiniFy/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Github className="mr-2 h-5 w-5" />
                        {t.download.viewReleases}
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-500 shadow-lg">
                    <svg
                      className="h-8 w-8 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      role="img"
                      aria-labelledby="linux-download-title"
                    >
                      <title id="linux-download-title">Linux download icon</title>
                      <path d="M12 11.5c-.2 0-.4.1-.5.2l-1.6 3.2c-.2.4-.7.5-1.1.4-.4-.2-.5-.7-.4-1.1l1.6-3.2c.4-.9 1.4-1.5 2.5-1.5 1 0 1.9.6 2.4 1.5l1.6 3.2c.2.4 0 .9-.4 1.1-.4.2-.9 0-1.1-.4l-1.6-3.2c-.3-.1-.4-.2-.5-.2z" />
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z" />
                    </svg>
                  </div>
                  <CardTitle>Linux</CardTitle>
                  <CardDescription>{t.download.linuxDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                  {release?.downloadUrl.linux ? (
                    <Button
                      size="lg"
                      className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-red-500 hover:to-orange-500"
                      asChild
                    >
                      <a href={release.downloadUrl.linux} download>
                        <Download className="mr-2 h-5 w-5" />
                        {t.download.downloadButton}
                      </a>
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline" className="w-full bg-transparent" asChild>
                      <a
                        href="https://github.com/ModioStudio/MiniFy/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Github className="mr-2 h-5 w-5" />
                        {t.download.viewReleases}
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t.download.systemRequirements}{" "}
                <a
                  href="https://github.com/ModioStudio/MiniFy#prerequisites"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {t.download.learnMore}
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
