"use client";
import type { ReactNode } from "react";
import { BrandLogo } from "@/app/BrandLogo";
import { rememberBookingLocale } from "@/lib/booking-storage";
import { bookingStrings } from "@/lib/booking-strings";
import type { Locale } from "@/lib/strings";
import styles from "./booking.module.css";
export function BookingShell({ locale, setLocale, children }: { locale: Locale; setLocale: (value: Locale) => void; children: ReactNode }) {
  const s = bookingStrings[locale];
  return <main lang={locale} className={`night-shell ${styles.shell}`}><div className={styles.container}>
    <header className={styles.header}><BrandLogo className="w-36" /><nav aria-label="Language">{(["en", "fr", "es"] as const).map(l => <button key={l} type="button" lang={l} aria-label={{ en: "English", fr: "Français", es: "Español" }[l]} aria-pressed={l === locale} onClick={() => { rememberBookingLocale(l); setLocale(l); }}>{l.toUpperCase()}</button>)}</nav></header>
    {children}
    <footer className={styles.footer}><a href="mailto:hello@getamourette.com">{s.support}</a><a href={`/reservation-terms?lang=${locale}`}>{s.conditions}</a><a href={`/privacy?lang=${locale}`}>{s.privacy}</a></footer>
  </div></main>;
}
