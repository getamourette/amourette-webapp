"use client";

import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { setPreferredLocale, usePreferredLocale } from "@/lib/useLocale";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/strings";

// Inline SVG flags, rendered whole in a small rounded frame (never circle
// cropped, which would eat the US canton). The switcher only ever shows them at
// ~14-16px, so the US flag is a clean solid canton — individual stars alias
// into blobs at this size.
const FLAG_SVG_CLASS = "block h-full w-auto";

function UsFlag() {
  const stripeH = 30 / 13;
  const rows = Array.from({ length: 13 }, (_, i) => i);
  return (
    <svg viewBox="0 0 60 30" className={FLAG_SVG_CLASS} aria-hidden>
      <rect width="60" height="30" fill="#fff" />
      {rows.map((i) =>
        i % 2 === 0 ? (
          <rect key={i} y={i * stripeH} width="60" height={stripeH} fill="#B22234" />
        ) : null
      )}
      <rect width="25.2" height={stripeH * 7} fill="#3C3B6E" />
    </svg>
  );
}

function FrFlag() {
  return (
    <svg viewBox="0 0 3 2" className={FLAG_SVG_CLASS} aria-hidden>
      <rect width="3" height="2" fill="#fff" />
      <rect width="1" height="2" fill="#002395" />
      <rect x="2" width="1" height="2" fill="#ED2939" />
    </svg>
  );
}

function EsFlag() {
  return (
    <svg viewBox="0 0 3 2" className={FLAG_SVG_CLASS} aria-hidden>
      <rect width="3" height="2" fill="#AA151B" />
      <rect y="0.5" width="3" height="1" fill="#F1BF00" />
    </svg>
  );
}

const LANGUAGE_META: Record<Locale, { code: string; name: string; Flag: () => React.ReactElement }> = {
  en: { code: "EN", name: "English", Flag: UsFlag },
  fr: { code: "FR", name: "Français", Flag: FrFlag },
  es: { code: "ES", name: "Español", Flag: EsFlag },
};

function Flag({ locale, size }: { locale: Locale; size: number }) {
  const { Flag: FlagSvg } = LANGUAGE_META[locale];
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-[3px] ring-1 ring-cream/15"
      style={{ height: size }}
    >
      <FlagSvg />
    </span>
  );
}

export function LanguageSelector({ className = "" }: { className?: string }) {
  const locale = usePreferredLocale();
  const [open, setOpen] = useState(false);
  const active = LANGUAGE_META[locale];

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        aria-label="Language"
        className={`inline-flex items-center gap-2 rounded-full border border-champagne/25 bg-velvet/50 py-2 pl-2 pr-3 text-[0.68rem] uppercase tracking-[0.16em] text-cream backdrop-blur outline-none transition-colors duration-300 hover:border-blush/60 focus-visible:border-blush data-[state=open]:border-blush/70 ${className}`}
        style={{ fontFamily: "var(--font-jost), system-ui, sans-serif" }}
      >
        <Flag locale={locale} size={14} />
        <span>{active.code}</span>
        <span
          aria-hidden
          className={`text-taupe transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          ⌄
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="end"
          className="lang-menu z-50 min-w-[10rem] rounded-2xl border border-champagne/20 bg-bordeaux/95 p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
          style={{ fontFamily: "var(--font-jost), system-ui, sans-serif" }}
        >
          <DropdownMenu.RadioGroup
            value={locale}
            onValueChange={(value) => setPreferredLocale(value as Locale)}
          >
            {SUPPORTED_LOCALES.map((option) => (
              <DropdownMenu.RadioItem
                key={option}
                value={option}
                className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-taupe outline-none transition-colors duration-150 data-[highlighted]:bg-cream/5 data-[highlighted]:text-cream data-[state=checked]:text-cream"
              >
                <Flag locale={option} size={16} />
                <span className="flex-1">{LANGUAGE_META[option].name}</span>
                <DropdownMenu.ItemIndicator>
                  <span className="text-blush">✓</span>
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
