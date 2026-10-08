import Link from "next/link";
import { BrandLogo } from "@/app/BrandLogo";
import { LegalLinks } from "@/components/LegalLinks";
import { GENERAL_CONTACT_HREF, GENERAL_EMAIL, legalHref, legalLabels, type LegalDocumentKind } from "@/lib/legal";
import { legalContent } from "@/lib/legal-content";
import { PRIVACY_CONTACT_HREF, PRIVACY_EMAIL, privacyHref, privacyLabels } from "@/lib/privacy";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/strings";

const languageNames = { en: "English", fr: "Français", es: "Español" };
const linkClass = "inline-flex min-h-11 items-center rounded-sm underline decoration-champagne/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blush";

// Public reading requires neither a session nor client-side JavaScript.
export function LegalDocument({ kind, locale }: { kind: LegalDocumentKind; locale: Locale }) {
  const labels = legalLabels[locale];
  const sections = legalContent[locale][kind];
  return <main lang={locale} className="night-shell min-h-dvh px-6 py-8 text-cream sm:py-12">
    <div className="relative mx-auto max-w-2xl break-words">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <Link href="/" aria-label={labels.back} className={linkClass}><BrandLogo /></Link>
        <nav aria-label={labels.language} className="flex gap-1">
          {SUPPORTED_LOCALES.map(language => <Link key={language} href={legalHref(kind, language)}
            hrefLang={language} lang={language} aria-label={languageNames[language]}
            aria-current={locale === language ? "page" : undefined}
            className={`${linkClass} min-w-11 justify-center px-2 text-xs tracking-widest ${locale === language ? "text-cream" : "text-taupe"}`}>
            {language.toUpperCase()}
          </Link>)}
        </nav>
      </header>
      <h1 className="font-display mt-12 text-4xl leading-tight italic sm:text-5xl">{labels[kind]}</h1>
      <p className="mt-4 text-sm text-taupe">{labels.updated}</p>
      <a href={GENERAL_CONTACT_HREF} className={`${linkClass} mt-4 max-w-full text-sm`}>{GENERAL_EMAIL}</a>
      <nav aria-label={labels.contents} className="my-10 border-y border-champagne/20 py-6">
        <h2 className="night-kicker mb-3">{labels.contents}</h2>
        <ol className="list-decimal pl-5 text-sm text-taupe marker:text-champagne">
          {sections.map(section => <li key={section.id} className="pl-1">
            <a href={`#${section.id}`} className={linkClass}>{section.title}</a>
          </li>)}
        </ol>
      </nav>
      <article className="space-y-12 text-sm leading-7 text-taupe sm:text-base">
        {sections.map((section, index) => <section key={section.id} id={section.id}
          aria-labelledby={`${section.id}-title`} className="scroll-mt-6">
          <h2 id={`${section.id}-title`} className="font-display mb-5 text-2xl leading-snug text-cream sm:text-3xl">
            {index + 1}. {section.title}
          </h2>
          <div className="space-y-4">
            {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.items && <ul className="list-disc space-y-2 pl-5 marker:text-champagne">
              {section.items.map(item => <li key={item} className="pl-1">{item}</li>)}
            </ul>}
            {section.after?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.id === "privacy" && <div className="flex flex-col items-start">
              <Link href={privacyHref(locale)} className={linkClass}>{privacyLabels[locale].title}</Link>
              <a href={PRIVACY_CONTACT_HREF} className={linkClass}>{PRIVACY_EMAIL}</a>
            </div>}
          </div>
        </section>)}
      </article>
      <footer className="mt-12 border-t border-champagne/20 pt-6">
        <LegalLinks locale={locale} />
        <Link href="/" className={`${linkClass} mt-4 text-sm text-taupe`}>{labels.back}</Link>
      </footer>
    </div>
  </main>;
}
