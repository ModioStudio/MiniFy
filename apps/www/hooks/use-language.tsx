"use client";

import { translations } from "@/lib/translations";
import { useEffect, useState } from "react";

export type Language = "en" | "de";

export function useLanguage() {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const storedLang = localStorage.getItem("language") as Language | null;
    const browserLang = navigator.language.split("-")[0] as Language;
    const initialLang = storedLang || (browserLang === "de" ? "de" : "en");
    setLanguage(initialLang);
  }, []);

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("language", lang);
  };

  return {
    language,
    setLanguage: changeLanguage,
    t: translations[language],
  };
}
