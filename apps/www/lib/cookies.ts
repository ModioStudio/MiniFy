export const COOKIE_NAMES = {
  LANGUAGE: "minify-language",
  THEME: "minify-theme",
} as const;

const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

interface CookieOptions {
  maxAge?: number;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const trimmedCookie = cookie.trim();
    const separatorIndex = trimmedCookie.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const cookieName = trimmedCookie.substring(0, separatorIndex).trim();
    const cookieValue = trimmedCookie.substring(separatorIndex + 1);
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (typeof document === "undefined") {
    return;
  }

  const {
    maxAge = COOKIE_MAX_AGE,
    path = "/",
    sameSite = "Lax",
    secure = window.location.protocol === "https:",
  } = options;

  let cookieString = `${name}=${encodeURIComponent(value)}`;
  cookieString += `; max-age=${maxAge}`;
  cookieString += `; path=${path}`;
  cookieString += `; samesite=${sameSite}`;

  if (secure) {
    cookieString += "; secure";
  }

  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not widely supported
  document.cookie = cookieString;
}

export function deleteCookie(name: string): void {
  if (typeof document === "undefined") {
    return;
  }

  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not widely supported
  document.cookie = `${name}=; max-age=0; path=/`;
}
