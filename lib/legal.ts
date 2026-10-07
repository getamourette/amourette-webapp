import { isLocale, type Locale } from "@/lib/strings";

export type LegalDocumentKind = "legal" | "terms";
export const GENERAL_EMAIL = "hello@getamourette.com";
export const GENERAL_CONTACT_HREF = `mailto:${GENERAL_EMAIL}`;

export function legalHref(kind: LegalDocumentKind, locale: Locale): string {
  return `/${kind}?lang=${locale}`;
}

export function legalLocale(value: string | string[] | undefined): Locale {
  return typeof value === "string" && isLocale(value) ? value : "en";
}

export const legalLabels: Record<Locale, {
  legal: string; terms: string; navigation: string; language: string;
  contents: string; back: string; updated: string; newTab: string;
}> = {
  en: {
    legal: "Legal notice", terms: "Terms of Use", navigation: "Legal information",
    language: "Language", contents: "On this page", back: "Back to Amourette",
    updated: "Last updated: 6 October 2026", newTab: "opens in a new tab",
  },
  fr: {
    legal: "Mentions légales", terms: "Conditions d’utilisation", navigation: "Informations légales",
    language: "Langue", contents: "Sur cette page", back: "Retour à Amourette",
    updated: "Dernière mise à jour : 6 octobre 2026", newTab: "s’ouvre dans un nouvel onglet",
  },
  es: {
    legal: "Aviso legal", terms: "Condiciones de uso", navigation: "Información legal",
    language: "Idioma", contents: "En esta página", back: "Volver a Amourette",
    updated: "Última actualización: 6 de octubre de 2026", newTab: "se abre en una pestaña nueva",
  },
};
