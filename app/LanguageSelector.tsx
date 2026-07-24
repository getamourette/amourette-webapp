"use client";

import { LANGUAGE_OPTIONS, setPreferredLocale, usePreferredLocale } from "@/lib/useLocale";
import type { Locale } from "@/lib/strings";

export function LanguageSelector({ className = "" }: { className?: string }) {
  const locale = usePreferredLocale();

  return (
    <label
      className={`inline-flex items-center rounded-full border border-champagne/25 bg-velvet/40 px-3.5 py-2 text-[0.68rem] uppercase tracking-[0.16em] text-taupe backdrop-blur transition-colors duration-300 focus-within:border-blush ${className}`}
      style={{ fontFamily: "var(--font-jost), system-ui, sans-serif" }}
    >
      <span className="sr-only">Language</span>
      <select
        value={locale}
        onChange={(event) => setPreferredLocale(event.target.value as Locale)}
        aria-label="Language"
        className="cursor-pointer bg-transparent text-inherit outline-none"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.locale} value={option.locale} className="bg-bordeaux text-cream">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
