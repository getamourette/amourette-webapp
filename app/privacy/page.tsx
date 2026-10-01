'use client';
import Link from 'next/link';
import { useBrowserLocale } from '@/lib/useLocale';
import { matchingConsentStrings } from '@/lib/matching-consent-strings';
import { LanguageSelector } from '@/app/LanguageSelector';
import { BrandLogo } from '@/app/BrandLogo';

// Interim test disclosure. #203 supplies the approved operator, complete policy
// and evidence-retention details before public registration can open.
export default function PrivacyPage() {
  const locale = useBrowserLocale();
  const s = matchingConsentStrings[locale];
  return <main className="night-shell px-6 py-12 text-cream"><div className="night-content mx-auto max-w-lg">
    <div className="flex items-center justify-between"><Link href="/" aria-label="Amourette"><BrandLogo /></Link><LanguageSelector /></div>
    <h1 className="font-display mt-10 text-3xl italic">{s.privacy}</h1>
    <p className="mt-6 leading-relaxed text-taupe">{s.draft}</p>
    <h2 className="night-kicker mt-8">{s.title}</h2>
    <p className="mt-4 leading-relaxed text-taupe">{s.purpose}</p>
    <p className="mt-4 leading-relaxed text-taupe">{s.retention}</p>
    <a className="mt-8 inline-flex min-h-11 items-center underline" href="mailto:privacy@getamourette.com">{s.contact}</a>
  </div></main>;
}
