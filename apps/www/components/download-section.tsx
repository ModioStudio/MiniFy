"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Download, Github, CheckCircle2 } from "lucide-react"
import Link from "next/link"

export function DownloadSection() {
  return (
    <section id="download" className="relative py-20 md:py-32">
      <div className="absolute inset-0 bg-linear-to-br from-[#1DB954]/5 via-transparent to-[#1ed760]/5" />

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">MiniFy Herunterladen</h2>
          <p className="mb-12 text-lg text-muted-foreground">
            Starte kostenlos mit MiniFy. Verfügbar für Windows, macOS und Linux.
          </p>

          {/* Quick Download Cards */}
          <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1DB954]/50">
              <div className="mb-4 flex justify-center">
                <div className="rounded-lg bg-[#1DB954]/10 p-4">
                  <svg className="h-12 w-12 text-[#1DB954]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M0 0h11.377v11.372H0zM12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zM12.623 12.623H24V24H12.623z" />
                  </svg>
                </div>
              </div>
              <h3 className="mb-2 text-2xl font-bold">Windows</h3>
              <p className="mb-6 text-sm text-muted-foreground">Windows 10/11 <br/> (64-bit)</p>
              <Button
                className="w-full bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                Herunterladen
              </Button>
            </Card>

            <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1DB954]/50">
              <div className="mb-4 flex justify-center">
                <div className="rounded-lg bg-[#1DB954]/10 p-4">
                  <svg className="h-12 w-12 text-[#1DB954]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                </div>
              </div>
              <h3 className="mb-2 text-2xl font-bold">macOS</h3>
              <p className="mb-6 text-sm text-muted-foreground">macOS 11+ (Intel & Apple Silicon)</p>
              <Button
                className="w-full bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                Herunterladen
              </Button>
            </Card>

            <Card className="group relative overflow-hidden border-border/40 bg-card/50 p-8 backdrop-blur-sm transition-all hover:border-[#1ed760]/50">
              <div className="mb-4 flex justify-center">
                <div className="rounded-lg bg-[#1ed760]/10 p-4">
                  <svg className="h-12 w-12 text-[#1ed760]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.835-.41 1.719-.41 2.626 0 .921.131 1.809.393 2.64.524 1.601 1.459 2.964 2.813 4.035.524.415 1.034.708 1.575.91.54.2 1.064.291 1.575.291.946 0 1.575-.291 1.575-.291.262 0 .524.131.786.393.262.262.393.524.393.786 0 .262-.131.524-.393.786-.262.262-.524.393-.786.393 0 0-.786.393-1.575.393-.655 0-1.247-.131-1.772-.393-.524-.262-1.034-.655-1.575-1.05-1.354-1.051-2.289-2.408-2.813-4.035-.262-.835-.393-1.719-.393-2.64 0-.921.131-1.809.393-2.64.589-1.772 1.831-3.47 2.716-4.521.75-1.067.974-1.928 1.05-3.02.065-1.491-.944-5.965 3.17-6.298.165-.013.325-.021.48-.021z" />
                  </svg>
                </div>
              </div>
              <h3 className="mb-2 text-2xl font-bold">Linux</h3>
              <p className="mb-6 text-sm text-muted-foreground">Ubuntu, Debian, Fedora (64-bit)</p>
              <Button
                className="w-full bg-linear-to-r from-[#1DB954] to-[#1ed760] text-white hover:from-[#1ed760] hover:to-[#1DB954]"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                Herunterladen
              </Button>
            </Card>
          </div>

          {/* Version Info */}
          <div className="mb-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-[#1DB954]" />
            <span>
              Neueste Version: <strong className="text-foreground">v0.1.0</strong> (28.10.2025)
            </span>
          </div>

          {/* Additional Links */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button variant="outline" size="lg" asChild>
              <Link href="/download">Alle Releases ansehen</Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <a href="https://github.com/ModioStudio/MiniFy" target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-5 w-5" />
                Auf GitHub ansehen
              </a>
            </Button>
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Systemanforderungen und Installationsanleitung{" "}
            <Link href="/download" className="font-medium text-[#1DB954] hover:underline">
              Mehr erfahren
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}
