import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  server: {
    port: 3002,
  },
  integrations: [
    starlight({
      title: "MiniFy Docs",
      description: "Documentation for MiniFy - Lightweight Spotify Mini Player",
      logo: {
        src: "./src/assets/logo.png",
        replacesTitle: false,
      },
      social: {
        github: "https://github.com/ModioStudio/MiniFy",
      },
      customCss: ["./src/styles/custom.css"],
      head: [
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.googleapis.com",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap",
          },
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "guides/introduction" },
            { label: "Installation", slug: "guides/installation" },
            { label: "Quick Start", slug: "guides/quick-start" },
          ],
        },
        {
          label: "Desktop App",
          items: [
            { label: "Overview", slug: "desktop/overview" },
            { label: "Authentication", slug: "desktop/authentication" },
            { label: "Layouts", slug: "desktop/layouts" },
            { label: "Themes", slug: "desktop/themes" },
            { label: "Keyboard Shortcuts", slug: "desktop/shortcuts" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "Settings", slug: "config/settings" },
            { label: "Custom Themes", slug: "config/custom-themes" },
          ],
        },
        {
          label: "Development",
          items: [
            { label: "Contributing", slug: "dev/contributing" },
            { label: "Architecture", slug: "dev/architecture" },
            { label: "Building", slug: "dev/building" },
          ],
        },
      ],
      editLink: {
        baseUrl: "https://github.com/ModioStudio/MiniFy/edit/main/apps/docs/",
      },
      lastUpdated: true,
    }),
  ],
});

