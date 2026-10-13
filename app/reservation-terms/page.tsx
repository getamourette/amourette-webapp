import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/app/BrandLogo";
import { isLocale } from "@/lib/strings";
import { bookingStrings } from "@/lib/booking-strings";
import { RESERVATION_POLICY_VERSION } from "@/lib/booking";
import styles from "@/components/booking/booking.module.css";
export const metadata: Metadata = { title: "Amourette · Reservation conditions", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ReservationTerms({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.version !== undefined && params.version !== RESERVATION_POLICY_VERSION) notFound();
  const locale = typeof params.lang === "string" && isLocale(params.lang) ? params.lang : "en";
  const s = bookingStrings[locale];
  return <main lang={locale} className={`night-shell ${styles.shell}`}><article className={styles.terms}><BrandLogo className="w-36" />
    <nav className={styles.footer} aria-label="Language">{(["en", "fr", "es"] as const).map(l => <a key={l} lang={l} hrefLang={l} href={`?lang=${l}&version=${RESERVATION_POLICY_VERSION}`}>{l.toUpperCase()}</a>)}</nav>
    <h1 className={styles.title}>{s.termsTitle}</h1><p>{s.operator}</p>
    {[s.termsIntro, s.termsArrival, s.termsCancel, s.termsOrganizer, s.termsTiming, s.termsRefund, s.termsAccess].map(text => <p key={text}>{text}</p>)}
    <footer className={styles.footer}><a href={`mailto:hello@getamourette.com`}>{s.support}</a><a href={`/privacy?lang=${locale}`}>{s.privacy}</a><span>{RESERVATION_POLICY_VERSION}</span></footer>
  </article></main>;
}
