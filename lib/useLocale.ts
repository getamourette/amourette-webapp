"use client";

import { useSyncExternalStore } from "react";
import { browserLocale, isLocale, type Locale } from "@/lib/strings";

const LOCALE_STORAGE_KEY = "paramour-locale";
const LOCALE_CHANGE_EVENT = "paramour-locale-change";

function storedLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(value) ? value : null;
}

export function preferredLocale(fallback: Locale = browserLocale()): Locale {
  return storedLocale() ?? fallback;
}

export function setPreferredLocale(locale: Locale) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
}

const subscribe = (onStoreChange: () => void) => {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  };
};

export function usePreferredLocale(fallback?: Locale): Locale {
  return useSyncExternalStore<Locale>(
    subscribe,
    () => preferredLocale(fallback ?? browserLocale()),
    () => "en"
  );
}

// Locale for pre-venue pages (landing, profile), where there is no venue to
// derive a language from so we follow the browser. navigator.language does not
// exist during SSR, so reading it at render time makes the server output differ
// from the client and triggers a hydration mismatch. useSyncExternalStore is
// the hydration-safe path: React renders the server snapshot ("en") for the
// server and the first client paint, then swaps to the real browser locale.
export function useBrowserLocale(): Locale {
  return usePreferredLocale();
}
