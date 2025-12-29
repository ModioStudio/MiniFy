"use client";

import { COOKIE_NAMES, getCookie, setCookie } from "@/lib/cookies";
import { type Language, type Translations, translations, isValidLanguage } from "@/lib/translations";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getBrowserLanguage(): Language {
  if (typeof navigator === "undefined") {
    return "en";
  }
  const browserLang = navigator.language.split("-")[0];
  if (isValidLanguage(browserLang)) {
    return browserLang;
  }
  return "en";
}

function updateDocumentLang(lang: Language): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps): ReactNode {
  const [language, setLanguageState] = useState<Language>("en");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const cookieLang = getCookie(COOKIE_NAMES.LANGUAGE);
    const initialLang = cookieLang && isValidLanguage(cookieLang)
      ? cookieLang
      : getBrowserLanguage();
    
    setLanguageState(initialLang);
    updateDocumentLang(initialLang);
    setIsInitialized(true);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    setCookie(COOKIE_NAMES.LANGUAGE, lang);
    updateDocumentLang(lang);
  }, []);

  const t = isInitialized ? translations[language] : translations.en;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
