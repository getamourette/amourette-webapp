import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";
import { legalLabels, legalLocale } from "@/lib/legal";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = legalLocale((await searchParams).lang);
  return {
    title: `${legalLabels[locale].terms} | Amourette`,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function TermsPage({ searchParams }: Props) {
  return <LegalDocument kind="terms" locale={legalLocale((await searchParams).lang)} />;
}
