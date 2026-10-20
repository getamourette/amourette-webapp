import { render } from "@react-email/render";
import type { Locale } from "@/lib/strings";

const copy = {
  en: { signature: "The Amourette team", subject: "Your Amourette reservation access", title: "Your evening, within reach.", body: "Use this private link to open your reservation.", action: "Open my reservation", help: "If you did not request this email, you can ignore it. Contact: hello@getamourette.com.", expires: "This link expires on" },
  fr: { signature: "L’équipe Amourette", subject: "Votre accès à la réservation Amourette", title: "Votre soirée vous attend.", body: "Ce lien privé vous permet de retrouver votre réservation.", action: "Ouvrir ma réservation", help: "Si vous n’avez pas demandé cet email, vous pouvez l’ignorer. Contact : hello@getamourette.com.", expires: "Ce lien expire le" },
  es: { signature: "El equipo Amourette", subject: "Acceso a tu reserva Amourette", title: "Tu noche te espera.", body: "Usa este enlace privado para abrir tu reserva.", action: "Abrir mi reserva", help: "Si no has solicitado este email, puedes ignorarlo. Contacto: hello@getamourette.com.", expires: "Este enlace caduca el" },
} satisfies Record<Locale, Record<string, string>>;

export async function renderReservationAccessEmail(locale: Locale, url: string, expires: string) {
  const s = copy[locale];
  const expiry = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(expires));
  const element = <html lang={locale}><body style={{ background: "#120A0F", color: "#EFE6E0", fontFamily: "Arial, sans-serif", margin: 0 }}>
    <main style={{ maxWidth: 560, padding: "40px 24px", margin: "auto" }}><p style={{ fontSize: 24 }}>Amourette</p>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>{s.title}</h1><p style={{ lineHeight: 1.7 }}>{s.body}</p>
      <p style={{ margin: "32px 0" }}><a href={url} style={{ color: "#EFE6E0", fontSize: 18 }}>{s.action}</a></p>
      <p>{s.expires} {expiry} UTC.</p><p style={{ lineHeight: 1.7 }}>{s.help}</p>
      <p>{s.signature}</p>
    </main></body></html>;
  return { subject: s.subject, html: await render(element), text: await render(element, { plainText: true }) };
}
