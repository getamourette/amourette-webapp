import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/app/BrandLogo";
import { isLocale, SUPPORTED_LOCALES } from "@/lib/strings";
import { PRIVACY_CONTACT_HREF, PRIVACY_EMAIL, privacyHref, privacyLabels } from "@/lib/privacy";
import { privacyPolicy } from "@/lib/privacy-policy";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function pageLocale(searchParams: Props["searchParams"]) {
  const { lang } = await searchParams;
  return typeof lang === "string" && isLocale(lang) ? lang : "en";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = await pageLocale(searchParams);
  return {
    title: `${privacyLabels[locale].title} | Amourette`,
    // Enable indexing only after the launch reconciliation tracked in #299.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

const languageNames = { en: "English", fr: "Français", es: "Español" };
const linkClass = "inline-flex min-h-11 items-center rounded-sm underline decoration-champagne/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blush";

// Server-render all policy text: reading it needs neither a session nor JavaScript.
export default async function PrivacyPage({ searchParams }: Props) {
  const locale = await pageLocale(searchParams);
  const policy = privacyPolicy[locale];
  const labels = privacyLabels[locale];

  return (
    <main lang={locale} className="night-shell min-h-dvh px-6 py-8 text-cream sm:py-12">
      <div className="relative mx-auto max-w-2xl break-words">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <Link href="/" aria-label={policy.back} className={linkClass}><BrandLogo /></Link>
          <nav aria-label="Language" className="flex gap-1">
            {SUPPORTED_LOCALES.map(language => (
              <Link key={language} href={privacyHref(language)} hrefLang={language} lang={language}
                aria-label={languageNames[language]} aria-current={locale === language ? "page" : undefined}
                className={`${linkClass} min-w-11 justify-center px-2 text-xs tracking-widest ${locale === language ? "text-cream" : "text-taupe"}`}>
                {language.toUpperCase()}
              </Link>
            ))}
          </nav>
        </header>

        <h1 className="font-display mt-12 text-4xl leading-tight italic sm:text-5xl">{labels.title}</h1>
        <p className="mt-4 text-sm text-taupe">{policy.updated}</p>
        <a href={PRIVACY_CONTACT_HREF} className={`${linkClass} mt-4 max-w-full text-sm`}>
          {PRIVACY_EMAIL}
        </a>

        <nav aria-label={policy.contents} className="my-10 border-y border-champagne/20 py-6">
          <h2 className="night-kicker mb-3">{policy.contents}</h2>
          <ol className="list-decimal pl-5 text-sm text-taupe marker:text-champagne">
            {policy.sections.map(section => (
              <li key={section.id} className="pl-1">
                <a href={`#${section.id}`} className={linkClass}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="space-y-12 text-sm leading-7 text-taupe sm:text-base">
          {policy.sections.map((section, index) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-6">
              <h2 id={`${section.id}-title`} className="font-display mb-5 text-2xl leading-snug text-cream sm:text-3xl">
                {index + 1}. {section.title}
              </h2>
              <div className="space-y-4">
                {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                {section.items && <ul className="list-disc space-y-2 pl-5 marker:text-champagne">
                  {section.items.map(item => <li key={item} className="pl-1">{item}</li>)}
                </ul>}
                {section.entries && <dl className="divide-y divide-champagne/15">
                  {section.entries.map(entry => <div key={entry.term} className="py-4 first:pt-0 last:pb-0">
                    <dt className="font-medium text-cream">{entry.term}</dt>
                    <dd className="mt-1">{entry.description}</dd>
                  </div>)}
                </dl>}
                {section.after?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                {section.id === "rights" && <div className="flex flex-col items-start gap-2">
                  <a href={PRIVACY_CONTACT_HREF} className={`${linkClass} text-cream`}>{labels.contact}</a>
                  <a href="https://www.cnil.fr/fr/adresser-une-plainte" rel="noreferrer" className={linkClass}>{policy.authority}</a>
                </div>}
              </div>
            </section>
          ))}
        </article>

        <footer className="mt-12 border-t border-champagne/20 pt-6">
          <Link href="/" className={`${linkClass} text-sm text-taupe`}>{policy.back}</Link>
        </footer>
      </div>
    </main>
  );
}
