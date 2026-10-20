import { launchQrStrings } from "@/lib/launch-qr-strings";
import { render } from "@react-email/render";
import type { Locale } from "@/lib/strings";
import type { LaunchMailContext } from "@/lib/launch-mail";

const copy = {
  en: {
    confirmed: "Your Amourette reservation is confirmed", cancelled: "Your Amourette reservation is cancelled",
    eventCancelled: "Your Amourette evening is cancelled", postponed: "Your Amourette evening is postponed",
    refunded: "Your Amourette refund has been processed", summary: "Your Amourette reservation, updated",
    cancelledBody: "Your arrival QR is no longer valid.",
    eventBody: "Your deposit will be refunded in full if it has not already been refunded.",
    postponedBody: "Your deposit will be refunded in full if it has not already been refunded.",
    newBooking: "A new date requires a new reservation.",
    refundBody: "Your deposit refund has been processed. It may take several business days to appear in your account.",
    eligible: "Your deposit will be refunded in full.",
    retained: "The free-cancellation deadline had passed. Your deposit is retained.",
    issue: "Contact us if you need help with your refund.",
    ended: "Your arrival QR is no longer valid.",
    deposit: "Deposit", reference: "Reservation reference", deadline: "Free cancellation until",
    late: "The free-cancellation deadline has passed. Your deposit is refunded when our team confirms your presence.",
    arrival: "Your deposit will be refunded after our team verifies your presence.",
    qrHelp: "Show this QR to our team when you arrive.",
    action: "Manage or cancel my reservation", recovery: "Find my reservation",
    signature: "The Amourette team", help: "hello@getamourette.com",
  },
  fr: {
    confirmed: "Votre réservation Amourette est confirmée", cancelled: "Votre réservation Amourette est annulée",
    eventCancelled: "Votre soirée Amourette est annulée", postponed: "Votre soirée Amourette est reportée",
    refunded: "Votre remboursement Amourette a été traité", summary: "Votre réservation Amourette mise à jour",
    cancelledBody: "Votre QR d’arrivée n’est plus valide.",
    eventBody: "Votre dépôt sera remboursé intégralement s’il ne l’a pas déjà été.",
    postponedBody: "Votre dépôt sera remboursé intégralement s’il ne l’a pas déjà été.",
    newBooking: "Une nouvelle date nécessite une nouvelle réservation.",
    refundBody: "Le remboursement de votre dépôt a été effectué. Il peut prendre quelques jours ouvrés pour apparaître sur votre compte.",
    eligible: "Votre dépôt sera remboursé intégralement.",
    retained: "La date limite d’annulation gratuite était dépassée. Votre dépôt est conservé.",
    issue: "Contactez-nous si vous avez besoin d’aide pour votre remboursement.",
    ended: "Votre QR d’arrivée n’est plus valide.",
    deposit: "Dépôt", reference: "Référence de réservation", deadline: "Annulation gratuite jusqu’au",
    late: "La date limite d’annulation gratuite est dépassée. Votre dépôt est remboursé lorsque notre équipe confirme votre présence.",
    arrival: "Votre dépôt sera remboursé après vérification de votre présence.",
    qrHelp: "Présentez ce QR à notre équipe à votre arrivée.",
    action: "Gérer ou annuler ma réservation", recovery: "Retrouver ma réservation",
    signature: "L’équipe Amourette", help: "hello@getamourette.com",
  },
  es: {
    confirmed: "Tu reserva Amourette está confirmada", cancelled: "Tu reserva Amourette está cancelada",
    eventCancelled: "Tu noche Amourette se ha cancelado", postponed: "Tu noche Amourette se ha aplazado",
    refunded: "Tu reembolso Amourette se ha procesado", summary: "Tu reserva Amourette actualizada",
    cancelledBody: "Tu QR de llegada ya no es válido.",
    eventBody: "Recibirás el reembolso íntegro del depósito si todavía no se ha reembolsado.",
    postponedBody: "Recibirás el reembolso íntegro del depósito si todavía no se ha reembolsado.",
    newBooking: "Una nueva fecha requiere una nueva reserva.",
    refundBody: "El reembolso de tu depósito se ha procesado. Puede tardar varios días hábiles en aparecer en tu cuenta.",
    eligible: "Recibirás el reembolso íntegro del depósito.",
    retained: "El plazo de cancelación gratuita había terminado. Tu depósito se conserva.",
    issue: "Contacta con nosotros si necesitas ayuda con tu reembolso.",
    ended: "Tu QR de llegada ya no es válido.",
    deposit: "Depósito", reference: "Referencia de reserva", deadline: "Cancelación gratuita hasta",
    late: "El plazo de cancelación gratuita ha terminado. Tu depósito se reembolsa cuando nuestro equipo confirma tu presencia.",
    arrival: "Tu depósito se reembolsa cuando nuestro equipo verifica tu presencia.",
    qrHelp: "Muestra este QR a nuestro equipo cuando llegues.",
    action: "Gestionar o cancelar mi reserva", recovery: "Encontrar mi reserva",
    signature: "El equipo Amourette", help: "hello@getamourette.com",
  },
} satisfies Record<Locale, Record<string, string>>;

export function ReservationLifecycleEmail({ context: c, url, expires, qr }: { context: LaunchMailContext; url: string; expires: string | null; qr: boolean }) {
  const s = copy[c.locale];
  const local = (value: string) => `${new Intl.DateTimeFormat(c.locale, { dateStyle: "full", timeStyle: "short", timeZone: c.timezone }).format(new Date(value))}`;
  const amount = new Intl.NumberFormat(c.locale, { style: "currency", currency: c.currency.toUpperCase() }).format(c.amount_minor / 100);
  const organizer = c.kind === "event_cancelled" || c.kind === "event_postponed" || (c.kind === "corrected_summary" && c.event_reason !== null);
  const postponed = c.kind === "event_postponed" || c.event_reason === "postponed";
  const cancelled = c.kind === "participant_cancelled" || (c.kind === "corrected_summary" && c.state === "cancelled");
  const refunded = c.kind === "refund_succeeded";
  const subject = refunded ? s.refunded : organizer ? (postponed ? s.postponed : s.eventCancelled) : cancelled ? s.cancelled : c.kind === "corrected_summary" ? s.summary : s.confirmed;
  const paragraphs: string[] = [];
  if (refunded) paragraphs.push(s.refundBody);
  else if (organizer) paragraphs.push(postponed ? s.postponedBody : s.eventBody, s.newBooking);
  else if (cancelled) paragraphs.push(s.cancelledBody);
  else if (!qr) paragraphs.push(s.ended);
  if (c.kind === "participant_cancelled") paragraphs.push(c.refund_eligible ? s.eligible : s.retained);
  else if (!refunded && c.kind === "corrected_summary") {
    if (c.refund_state === "succeeded") paragraphs.push(s.refundBody);
    else if (c.refund_state === "failed" || c.refund_state === "review_needed") paragraphs.push(s.issue);
    else if (c.refund_eligible && !organizer) paragraphs.push(s.eligible);
    else if (cancelled && !organizer) paragraphs.push(s.retained);
  }
  return { subject, element: <html lang={c.locale}><body style={{ background: "#120A0F", color: "#EFE6E0", fontFamily: "Arial, sans-serif", margin: 0 }}>
    <main style={{ maxWidth: 560, padding: "40px 24px", margin: "auto", overflowWrap: "anywhere" }}>
      <p style={{ fontSize: 28, fontFamily: "Georgia, serif", fontStyle: "italic", color: "#c94655" }}>Amourette</p>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 28, lineHeight: 1.25 }}>{subject}</h1>
      {paragraphs.map((p, i) => <p key={i} style={{ lineHeight: 1.7 }}>{p}</p>)}
      <p style={{ lineHeight: 1.7 }}>{local(c.starts_at)}<br />{c.timezone}</p>
      <p style={{ lineHeight: 1.7 }}><strong>{c.venue_name}</strong><br />{[c.address, c.city].filter(Boolean).join(" · ")}</p>
      {qr && <>
        {/* A CID attachment keeps the arrival credential off public image URLs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="cid:reservation-qr" alt={launchQrStrings[c.locale].alt} width={240} height={240} style={{ display: "block", maxWidth: "100%", height: "auto", background: "white" }} />
        <p style={{ lineHeight: 1.7 }}>{s.qrHelp}</p>
      </>}
      <p>{s.deposit}: {amount}<br />{s.reference}: {c.reservation_id}</p>
      {qr && <>
        <p style={{ lineHeight: 1.7 }}>{s.arrival}</p>
        <p>{s.deadline}: {local(c.cancellation_deadline)}</p>
        {!c.before_deadline && <p style={{ lineHeight: 1.7 }}>{s.late}</p>}
      </>}
      <p style={{ margin: "32px 0" }}><a href={url} style={{ color: "#EFE6E0", fontSize: 18 }}>{expires ? s.action : s.recovery}</a></p>
      {expires && <p><a href={`${c.origin}/events/${c.night_id}`} style={{ color: "#EFE6E0" }}>{s.recovery}</a></p>}
      <p style={{ lineHeight: 1.7 }}>{s.signature}<br /><a href="mailto:hello@getamourette.com" style={{ color: "#EFE6E0" }}>{s.help}</a></p>
    </main></body></html> };
}

export async function renderReservationLifecycleEmail(context: LaunchMailContext, url: string, expires: string | null, qr: boolean) {
  const { subject, element } = ReservationLifecycleEmail({ context, url, expires, qr });
  return { subject, html: await render(element), text: await render(element, { plainText: true }) };
}
