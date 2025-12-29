import enTranslations from "@/public/locales/en.json";
import deTranslations from "@/public/locales/de.json";
import ruTranslations from "@/public/locales/ru.json";
import esTranslations from "@/public/locales/es.json";
import frTranslations from "@/public/locales/fr.json";
import zhTranslations from "@/public/locales/zh.json";
import jaTranslations from "@/public/locales/ja.json";
import ptTranslations from "@/public/locales/pt.json";

export type Language = "en" | "de" | "ru" | "es" | "fr" | "zh" | "ja" | "pt";

export const LANGUAGES: { code: Language; name: string; flag: string }[] = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
];

export interface Translations {
  nav: {
    features: string;
    download: string;
    opensource: string;
  };
  hero: {
    badge: string;
    titleBefore: string;
    titleAfter: string;
    description: string;
    downloadButton: string;
    githubButton: string;
  };
  features: {
    sectionTitle: string;
    sectionDescription: string;
    spotify: {
      title: string;
      description: string;
    };
    layouts: {
      title: string;
      description: string;
    };
    themes: {
      title: string;
      description: string;
    };
    performance: {
      title: string;
      description: string;
    };
    secure: {
      title: string;
      description: string;
    };
    customizable: {
      title: string;
      description: string;
    };
  };
  download: {
    sectionTitle: string;
    sectionDescription: string;
    latestVersion: string;
    loading: string;
    windowsDescription: string;
    linuxDescription: string;
    downloadButton: string;
    viewReleases: string;
    systemRequirements: string;
    learnMore: string;
  };
  downloadPage: {
    title: string;
    subtitle: string;
    recommended: string;
    windows: {
      title: string;
      description: string;
      features: string[];
      size: string;
    };
    macos: {
      title: string;
      description: string;
      features: string[];
      size: string;
    };
    linux: {
      title: string;
      description: string;
      features: string[];
      size: string;
    };
    latestVersion: string;
    releasedOn: string;
    allReleases: string;
    systemRequirements: string;
    requirements: {
      os: string;
      cpu: string;
      ram: string;
      other: string;
      minRam: string;
      recRam: string;
      usage: string;
      internet: string;
      spotifyAccount: string;
      storage: string;
    };
    installation: string;
    installSteps: {
      windows: string[];
      macos: string[];
      linux: {
        deb: string;
        rpm: string;
        appimage: string;
      };
    };
    help: {
      title: string;
      description: string;
      docs: string;
      issues: string;
    };
  };
  opensource: {
    title: string;
    description: string;
    stars: string;
    forks: string;
    contributors: string;
    starButton: string;
    contributeButton: string;
    license: string;
    viewAll: string;
  };
  footer: {
    description: string;
    product: string;
    features: string;
    download: string;
    releases: string;
    community: string;
    contributing: string;
    codeOfConduct: string;
    madeWith: string;
    byTeam: string;
    allRightsReserved: string;
  };
}

export const translations: Record<Language, Translations> = {
  en: enTranslations,
  de: deTranslations,
  ru: ruTranslations,
  es: esTranslations,
  fr: frTranslations,
  zh: zhTranslations,
  ja: jaTranslations,
  pt: ptTranslations,
};

export function getTranslations(language: Language): Translations {
  return translations[language];
}

export function isValidLanguage(lang: string): lang is Language {
  return LANGUAGES.some((l) => l.code === lang);
}
