import { launchMailLogo } from "@/lib/launch-mail-logo";
import { launchQrStrings } from "@/lib/launch-qr-strings";
import { render } from "@react-email/render";
import type { Locale } from "@/lib/strings";
import { launchMailZone, type LaunchMailContext } from "@/lib/launch-mail";

const copy = {
  en: {
    confirmed: "Your place is booked for {day}", summary: "Your updated reservation for {day}",
    cancelled: "Your reservation for {day} is cancelled",
    eventCancelled: "The Amourette evening on {day} is cancelled", postponed: "The Amourette evening on {day} is postponed",
    refunded: "Your {amount} deposit has been refunded",
    ended: "Your arrival QR is no longer valid.",
    eventBody: "Your {amount} deposit will be refunded in full if it has not already been refunded.",
    newBooking: "A new date requires a new reservation.",
    refundDone: "Your deposit refund has been processed.",
    refundDelay: "It may take several business days to appear in your account.",
    eligible: "Your {amount} deposit will be refunded in full.",
    retained: "The free-cancellation deadline had passed. Your {amount} deposit is retained.",
    issue: "Contact us if you need help with your refund.",
    qrHelp: "Show this QR to our team when you arrive.",
    deposit: "Deposit: {amount}, refunded once our team confirms your presence.",
    deadline: "Free cancellation until {date}.", late: "Free cancellation ended on {date}.",
    action: "Manage or cancel my reservation", reference: "Reference:", recoveryHint: "Link expired?", recovery: "Find my reservation",
    terms: "Reservation conditions", help: "Questions?", signature: "The Amourette team",
  },
  fr: {
    confirmed: "Votre place est réservée pour le {day}", summary: "Votre réservation du {day}, mise à jour",
    cancelled: "Votre réservation du {day} est annulée",
    eventCancelled: "La soirée Amourette du {day} est annulée", postponed: "La soirée Amourette du {day} est reportée",
    refunded: "Votre dépôt de {amount} a été remboursé",
    ended: "Votre QR d’arrivée n’est plus valide.",
    eventBody: "Votre dépôt de {amount} sera remboursé intégralement s’il ne l’a pas déjà été.",
    newBooking: "Une nouvelle date nécessite une nouvelle réservation.",
    refundDone: "Le remboursement de votre dépôt a été effectué.",
    refundDelay: "Il peut prendre quelques jours ouvrés pour apparaître sur votre compte.",
    eligible: "Votre dépôt de {amount} sera remboursé intégralement.",
    retained: "La date limite d’annulation gratuite était dépassée. Votre dépôt de {amount} est conservé.",
    issue: "Contactez-nous si vous avez besoin d’aide pour votre remboursement.",
    qrHelp: "Présentez ce QR à notre équipe à votre arrivée.",
    deposit: "Dépôt : {amount}, remboursé dès que notre équipe confirme votre présence.",
    deadline: "Annulation gratuite jusqu’au {date}.", late: "L’annulation gratuite a pris fin le {date}.",
    action: "Gérer ou annuler ma réservation", reference: "Référence :", recoveryHint: "Lien expiré ?", recovery: "Retrouver ma réservation",
    terms: "Conditions de réservation", help: "Une question ?", signature: "L’équipe Amourette",
  },
  es: {
    confirmed: "Tu plaza está reservada para el {day}", summary: "Tu reserva del {day}, actualizada",
    cancelled: "Tu reserva del {day} está cancelada",
    eventCancelled: "La noche Amourette del {day} se ha cancelado", postponed: "La noche Amourette del {day} se ha aplazado",
    refunded: "Tu depósito de {amount} se ha reembolsado",
    ended: "Tu QR de llegada ya no es válido.",
    eventBody: "Recibirás el reembolso íntegro de tu depósito de {amount} si todavía no se ha reembolsado.",
    newBooking: "Una nueva fecha requiere una nueva reserva.",
    refundDone: "El reembolso de tu depósito se ha procesado.",
    refundDelay: "Puede tardar varios días hábiles en aparecer en tu cuenta.",
    eligible: "Recibirás el reembolso íntegro de tu depósito de {amount}.",
    retained: "El plazo de cancelación gratuita había terminado. Tu depósito de {amount} se conserva.",
    issue: "Contacta con nosotros si necesitas ayuda con tu reembolso.",
    qrHelp: "Muestra este QR a nuestro equipo cuando llegues.",
    deposit: "Depósito: {amount}, se reembolsa cuando nuestro equipo confirma tu presencia.",
    deadline: "Cancelación gratuita hasta el {date}.", late: "La cancelación gratuita terminó el {date}.",
    action: "Gestionar o cancelar mi reserva", reference: "Referencia:", recoveryHint: "¿Enlace caducado?", recovery: "Encontrar mi reserva",
    terms: "Condiciones de reserva", help: "¿Dudas?", signature: "El equipo Amourette",
  },
} satisfies Record<Locale, Record<string, string>>;

export function ReservationLifecycleEmail({ context: c, url, expires, qr }: { context: LaunchMailContext; url: string; expires: string | null; qr: boolean }) {
  const s = copy[c.locale];
  const format = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(c.locale, { ...options, timeZone: c.timezone }).format(new Date(value));
  const day = format(c.starts_at, { weekday: "long", day: "numeric", month: "long" });
  const local = (value: string) => `${format(value, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} (${launchMailZone(c.locale, c.timezone)})`;
  const amount = new Intl.NumberFormat(c.locale, { style: "currency", currency: c.currency.toUpperCase() }).format(c.amount_minor / 100);
  const organizer = c.kind === "event_cancelled" || c.kind === "event_postponed" || (c.kind === "corrected_summary" && c.event_reason !== null);
  const postponed = c.kind === "event_postponed" || c.event_reason === "postponed";
  const cancelled = c.kind === "participant_cancelled" || (c.kind === "corrected_summary" && c.state === "cancelled");
  const refunded = c.kind === "refund_succeeded";
  const subject = (refunded ? s.refunded : organizer ? (postponed ? s.postponed : s.eventCancelled) : cancelled ? s.cancelled : c.kind === "corrected_summary" ? s.summary : s.confirmed)
    .replace("{day}", () => day).replace("{amount}", () => amount);
  const paragraphs: string[] = [];
  if (refunded) paragraphs.push(s.refundDelay);
  else if (organizer) paragraphs.push(`${s.eventBody} ${s.newBooking}`);
  else if (cancelled || !qr) paragraphs.push(s.ended);
  if (c.kind === "participant_cancelled") paragraphs.push(c.refund_eligible ? s.eligible : s.retained);
  else if (!refunded && c.kind === "corrected_summary") {
    if (c.refund_state === "succeeded") paragraphs.push(`${s.refundDone} ${s.refundDelay}`);
    else if (c.refund_state === "failed" || c.refund_state === "review_needed") paragraphs.push(s.issue);
    else if (c.refund_eligible && !organizer) paragraphs.push(s.eligible);
    else if (cancelled && !organizer) paragraphs.push(s.retained);
  }
  const link = { color: "#EFE6E0" };
  return { subject, element: <html lang={c.locale}><body style={{ background: "#120A0F", color: "#EFE6E0", fontFamily: "Arial, sans-serif", margin: 0 }}>
    <main style={{ maxWidth: 560, padding: "40px 24px", margin: "auto", overflowWrap: "anywhere", background: "#120A0F" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`cid:${launchMailLogo.cid}`} alt="Amourette" width={launchMailLogo.width} height={launchMailLogo.height} style={{ display: "block", margin: "0 0 28px", background: "#120A0F", color: "#EFE6E0", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 28 }} />
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 28, lineHeight: 1.25 }}>{subject}.</h1>
      {paragraphs.map((p, i) => <p key={i} style={{ lineHeight: 1.6 }}>{p.replace("{amount}", () => amount)}</p>)}
      {expires && <p style={{ margin: "28px 0" }}><a href={url} style={{ display: "inline-block", background: "#c94655", color: "#FFFFFF", fontSize: 17, fontWeight: 700, textDecoration: "none", padding: "14px 22px", borderRadius: 8 }}>{s.action}</a></p>}
      <p style={{ lineHeight: 1.6 }}>{local(c.starts_at)}<br /><strong>{c.venue_name}</strong>{(qr ? [c.address, c.city] : [c.city]).filter(Boolean).map(part => `, ${part}`)}</p>
      {qr && <>
        {/* A CID attachment keeps the arrival credential off public image URLs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="cid:reservation-qr" alt={launchQrStrings[c.locale].alt} width={240} height={240} style={{ display: "block", maxWidth: "100%", height: "auto", background: "white" }} />
        <p style={{ lineHeight: 1.6 }}>{s.qrHelp}</p>
        <p style={{ lineHeight: 1.6 }}>{s.deposit.replace("{amount}", () => amount)}<br />{(c.before_deadline ? s.deadline : s.late).replace("{date}", () => local(c.cancellation_deadline))}</p>
      </>}
      <p style={{ color: "#bca9a3", fontSize: 14, lineHeight: 1.7, marginTop: 28 }}>
        {s.reference} {c.reservation_id}<br />
        {expires && <>{s.recoveryHint} </>}<a href={expires ? `${c.origin}/events/${c.night_id}` : url} style={link}>{s.recovery}</a> · <a href={`${c.origin}/reservation-terms?lang=${c.locale}`} style={link}>{s.terms}</a><br />
        {s.help} <a href="mailto:hello@getamourette.com" style={link}>hello@getamourette.com</a><br />
        {s.signature}
      </p>
    </main></body></html> };
}

export async function renderReservationLifecycleEmail(context: LaunchMailContext, url: string, expires: string | null, qr: boolean) {
  const { subject, element } = ReservationLifecycleEmail({ context, url, expires, qr });
  return { subject, html: await render(element), text: await render(element, { plainText: true }) };
}
