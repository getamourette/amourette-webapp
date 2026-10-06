import type { Locale } from "@/lib/strings";

import { PRIVACY_EMAIL } from "./privacy-contact";

export { PRIVACY_EMAIL };
export const PRIVACY_CONTACT_HREF = `mailto:${PRIVACY_EMAIL}`;

export function privacyHref(locale: Locale): string {
  return `/privacy?lang=${locale}`;
}

export const privacyLabels: Record<Locale, { title: string; contact: string }> = {
  en: { title: "Privacy policy", contact: "Privacy questions and data requests" },
  fr: { title: "Politique de confidentialité", contact: "Questions et demandes concernant tes données" },
  es: { title: "Política de privacidad", contact: "Consultas y solicitudes sobre tus datos" },
};
