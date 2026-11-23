import { render } from "@react-email/render";
import type { Locale } from "@/lib/strings";
import { launchMailLogo } from "@/lib/launch-mail-logo";
import { launchMailZone } from "@/lib/launch-mail";

const copy = {
  en: { signature: "The Amourette team", subject: "Your Amourette reservation link", title: "Here is the link to your reservation.", action: "Open my reservation", expires: "This private link expires on {date} ({zone}).", ignore: "Didn’t ask for it? You can ignore this email.", help: "Questions?" },
  fr: { signature: "L’équipe Amourette", subject: "Votre lien de réservation Amourette", title: "Voici le lien vers votre réservation.", action: "Ouvrir ma réservation", expires: "Ce lien privé expire le {date} ({zone}).", ignore: "Vous n’avez rien demandé ? Ignorez simplement cet email.", help: "Une question ?" },
  es: { signature: "El equipo Amourette", subject: "Tu enlace de reserva Amourette", title: "Aquí tienes el enlace a tu reserva.", action: "Abrir mi reserva", expires: "Este enlace privado caduca el {date} ({zone}).", ignore: "¿No lo has pedido? Puedes ignorar este email.", help: "¿Dudas?" },
} satisfies Record<Locale, Record<string, string>>;

export async function renderReservationAccessEmail(locale: Locale, url: string, expires: string, timezone: string) {
  const s = copy[locale];
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(expires));
  const link = { color: "#EFE6E0" };
  const element = <html lang={locale}><body style={{ background: "#120A0F", color: "#EFE6E0", fontFamily: "Arial, sans-serif", margin: 0 }}>
    <main style={{ maxWidth: 560, padding: "40px 24px", margin: "auto", overflowWrap: "anywhere", background: "#120A0F" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`cid:${launchMailLogo.cid}`} alt="Amourette" width={launchMailLogo.width} height={launchMailLogo.height} style={{ display: "block", margin: "0 0 28px", background: "#120A0F", color: "#EFE6E0", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 28 }} />
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 28, lineHeight: 1.25 }}>{s.title}</h1>
      <p style={{ margin: "28px 0" }}><a href={url} style={{ display: "inline-block", background: "#c94655", color: "#FFFFFF", fontSize: 17, fontWeight: 700, textDecoration: "none", padding: "14px 22px", borderRadius: 8 }}>{s.action}</a></p>
      <p style={{ lineHeight: 1.6 }}>{s.expires.replace("{date}", () => date).replace("{zone}", () => launchMailZone(locale, timezone))}</p>
      <p style={{ color: "#bca9a3", fontSize: 14, lineHeight: 1.7 }}>{s.ignore}<br />{s.help} <a href="mailto:hello@getamourette.com" style={link}>hello@getamourette.com</a><br />{s.signature}</p>
    </main></body></html>;
  return { subject: s.subject, html: await render(element), text: await render(element, { plainText: true }) };
}
