import Link from "next/link";
import { legalHref, legalLabels } from "@/lib/legal";
import { privacyHref, privacyLabels } from "@/lib/privacy";
import type { Locale } from "@/lib/strings";

export function LegalLinks({ locale, newTab = false }: { locale: Locale; newTab?: boolean }) {
  const labels = legalLabels[locale];
  const links = [
    { href: legalHref("legal", locale), label: labels.legal },
    { href: legalHref("terms", locale), label: labels.terms },
    { href: privacyHref(locale), label: privacyLabels[locale].title },
  ];
  return <nav aria-label={labels.navigation} className="flex flex-wrap justify-center gap-x-6">
    {links.map(link => <Link key={link.href} href={link.href} prefetch={false}
      target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined}
      className="inline-flex min-h-11 items-center rounded-sm text-xs text-taupe underline decoration-champagne/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blush">
      {link.label}{newTab && <span className="sr-only"> ({labels.newTab})</span>}
    </Link>)}
  </nav>;
}
