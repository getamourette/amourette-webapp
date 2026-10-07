import Link from "next/link";
import { PRIVACY_CONTACT_HREF, PRIVACY_EMAIL, privacyHref, privacyLabels } from "@/lib/privacy";
import type { Locale } from "@/lib/strings";

export function PrivacyLinks({ locale }: { locale: Locale }) {
  const labels = privacyLabels[locale];
  const linkClass = "inline-flex min-h-11 items-center rounded-sm text-sm underline decoration-champagne/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blush";
  return <div className="mt-3 flex flex-col items-start text-taupe">
    <a href={PRIVACY_CONTACT_HREF} className={linkClass} aria-label={`${labels.contact}: ${PRIVACY_EMAIL}`}>
      {PRIVACY_EMAIL}
    </a>
    <Link href={privacyHref(locale)} rel="noreferrer" className={linkClass}>{labels.title}</Link>
  </div>;
}
