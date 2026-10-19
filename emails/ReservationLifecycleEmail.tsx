import { launchQrStrings } from "@/lib/launch-qr-strings";
import { render } from "@react-email/render";
import type { Locale } from "@/lib/strings";
import type { LaunchMailContext } from "@/lib/launch-mail";

const copy = {
  en: {
    confirmed: "Your Amourette reservation is confirmed", cancelled: "Your Amourette reservation is cancelled",
    eventCancelled: "Your Amourette evening is cancelled", postponed: "Your Amourette evening is postponed",
    refunded: "Your Amourette refund has been processed", summary: "Your Amourette reservation, updated",
    confirmedBody: "Your place is reserved. Keep this email for the evening.",
    cancelledBody: "Your reservation is cancelled. Its arrival QR is no longer valid.",
    eventBody: "We have cancelled this evening. We will refund all paid deposits that have not already been refunded, including deposits retained after a late cancellation.",
    postponedBody: "We have postponed this evening. We will refund all paid deposits that have not already been refunded, including deposits retained after a late cancellation.",
    newBooking: "A new date requires a new reservation. Your reservation and deposit will not be transferred automatically.",
    refundBody: "Stripe has confirmed that your full deposit refund has been processed. It may take several business days to appear in your account; this is not confirmation of bank credit.",
    eligible: "You are eligible for a full deposit refund. You can check its progress from your reservation.",
    retained: "The free-cancellation deadline had passed. Your deposit is retained. For an exceptional refund request, contact hello@getamourette.com; requests are reviewed individually.",
    issue: "For information about your refund, contact hello@getamourette.com.",
    ended: "This reservation no longer has a valid arrival QR. You can still consult your reservation and refund status.",
    deposit: "Deposit", reference: "Reservation reference", end: "End", deadline: "Free cancellation until",
    late: "The free-cancellation deadline has passed. Your deposit is refunded when our team confirms your presence.",
    arrival: "You may arrive throughout the scheduled evening. Our team verifies your presence to trigger a full deposit refund, including if the bar is full and cannot admit you. Your reservation does not guarantee admission or include a drink.",
    qr: "Your personal arrival QR", fallback: "If the image cannot be displayed, open your reservation. Do not share your QR or private link.",
    action: "Manage or cancel my reservation", recovery: "Find my reservation", expires: "Private link valid until", expiredHelp: "If this link expires:",
    help: "Questions? hello@getamourette.com", privacy: "This is an operational reservation email. You have not been subscribed to marketing emails.",
  },
  fr: {
    confirmed: "Votre réservation Amourette est confirmée", cancelled: "Votre réservation Amourette est annulée",
    eventCancelled: "Votre soirée Amourette est annulée", postponed: "Votre soirée Amourette est reportée",
    refunded: "Votre remboursement Amourette a été traité", summary: "Votre réservation Amourette mise à jour",
    confirmedBody: "Votre place est réservée. Gardez cet email pour la soirée.",
    cancelledBody: "Votre réservation est annulée. Son QR d’arrivée n’est plus valide.",
    eventBody: "Nous avons annulé cette soirée. Nous rembourserons tous les dépôts payés qui n’ont pas déjà été remboursés, y compris ceux conservés après une annulation tardive.",
    postponedBody: "Nous avons reporté cette soirée. Nous rembourserons tous les dépôts payés qui n’ont pas déjà été remboursés, y compris ceux conservés après une annulation tardive.",
    newBooking: "Une nouvelle date nécessite une nouvelle réservation. Votre réservation et votre dépôt ne seront pas transférés automatiquement.",
    refundBody: "Stripe a confirmé le traitement du remboursement intégral de votre dépôt. Son apparition sur votre compte peut prendre plusieurs jours ouvrés ; cet email ne confirme pas le crédit bancaire.",
    eligible: "Vous avez droit au remboursement intégral du dépôt. Vous pouvez suivre son avancement depuis votre réservation.",
    retained: "La date limite d’annulation gratuite était dépassée. Votre dépôt est conservé. Pour une demande exceptionnelle de remboursement, contactez hello@getamourette.com ; chaque demande est examinée individuellement.",
    issue: "Pour des informations sur votre remboursement, contactez hello@getamourette.com.",
    ended: "Cette réservation ne dispose plus d’un QR d’arrivée valide. Vous pouvez toujours consulter votre réservation et le statut du remboursement.",
    deposit: "Dépôt", reference: "Référence de réservation", end: "Fin", deadline: "Annulation gratuite jusqu’au",
    late: "La date limite d’annulation gratuite est dépassée. Votre dépôt est remboursé lorsque notre équipe confirme votre présence.",
    arrival: "Vous pouvez arriver pendant toute la soirée prévue. Notre équipe vérifie votre présence pour déclencher le remboursement intégral du dépôt, y compris si le bar est complet et ne peut pas vous accueillir. La réservation ne garantit pas l’admission et n’inclut pas de boisson.",
    qr: "Votre QR personnel d’arrivée", fallback: "Si l’image ne s’affiche pas, ouvrez votre réservation. Ne partagez ni votre QR ni votre lien privé.",
    action: "Gérer ou annuler ma réservation", recovery: "Retrouver ma réservation", expires: "Lien privé valable jusqu’au", expiredHelp: "Si ce lien expire :",
    help: "Une question ? hello@getamourette.com", privacy: "Cet email concerne votre réservation. Vous n’avez pas été inscrit aux emails marketing.",
  },
  es: {
    confirmed: "Tu reserva Amourette está confirmada", cancelled: "Tu reserva Amourette está cancelada",
    eventCancelled: "Tu noche Amourette se ha cancelado", postponed: "Tu noche Amourette se ha aplazado",
    refunded: "Tu reembolso Amourette se ha procesado", summary: "Tu reserva Amourette actualizada",
    confirmedBody: "Tu plaza está reservada. Guarda este email para la noche.",
    cancelledBody: "Tu reserva está cancelada. Su QR de llegada ya no es válido.",
    eventBody: "Hemos cancelado esta noche. Reembolsaremos todos los depósitos pagados que no se hayan reembolsado, incluidos los retenidos tras una cancelación tardía.",
    postponedBody: "Hemos aplazado esta noche. Reembolsaremos todos los depósitos pagados que no se hayan reembolsado, incluidos los retenidos tras una cancelación tardía.",
    newBooking: "Una nueva fecha requiere una nueva reserva. Tu reserva y tu depósito no se transferirán automáticamente.",
    refundBody: "Stripe ha confirmado que se ha procesado el reembolso íntegro de tu depósito. Puede tardar varios días hábiles en aparecer en tu cuenta; este email no confirma el abono bancario.",
    eligible: "Tienes derecho al reembolso íntegro del depósito. Puedes consultar su estado desde tu reserva.",
    retained: "El plazo de cancelación gratuita había terminado. Tu depósito se conserva. Para solicitar un reembolso excepcional, contacta con hello@getamourette.com; las solicitudes se estudian individualmente.",
    issue: "Para obtener información sobre tu reembolso, contacta con hello@getamourette.com.",
    ended: "Esta reserva ya no tiene un QR de llegada válido. Todavía puedes consultar tu reserva y el estado del reembolso.",
    deposit: "Depósito", reference: "Referencia de reserva", end: "Fin", deadline: "Cancelación gratuita hasta",
    late: "El plazo de cancelación gratuita ha terminado. Tu depósito se reembolsa cuando nuestro equipo confirma tu presencia.",
    arrival: "Puedes llegar durante todo el horario previsto. Nuestro equipo verifica tu presencia para iniciar el reembolso íntegro, incluso si el bar está lleno y no puede dejarte entrar. Tu reserva no garantiza la admisión ni incluye una bebida.",
    qr: "Tu QR personal de llegada", fallback: "Si la imagen no aparece, abre tu reserva. No compartas tu QR ni tu enlace privado.",
    action: "Gestionar o cancelar mi reserva", recovery: "Encontrar mi reserva", expires: "Enlace privado válido hasta", expiredHelp: "Si este enlace caduca:",
    help: "¿Alguna pregunta? hello@getamourette.com", privacy: "Este email corresponde a tu reserva. No te hemos suscrito a emails de marketing.",
  },
} satisfies Record<Locale, Record<string, string>>;

export function ReservationLifecycleEmail({ context: c, url, expires, qr }: { context: LaunchMailContext; url: string; expires: string | null; qr: boolean }) {
  const s = copy[c.locale];
  const local = (value: string) => `${new Intl.DateTimeFormat(c.locale, { dateStyle: "full", timeStyle: "short", timeZone: c.timezone }).format(new Date(value))} (${c.timezone})`;
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
  else paragraphs.push(qr ? s.confirmedBody : s.ended);
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
      <p style={{ lineHeight: 1.7 }}><strong>{c.venue_name}</strong><br />{[c.address, c.city].filter(Boolean).join(" · ")}<br />{local(c.starts_at)}<br />{s.end}: {local(c.ends_at)}</p>
      <p>{s.deposit}: {amount}<br />{s.reference}: {c.reservation_id}</p>
      {qr && <>
        <p style={{ lineHeight: 1.7 }}>{s.arrival}</p>
        <p>{s.deadline}: {local(c.cancellation_deadline)}</p>
        {!c.before_deadline && <p style={{ lineHeight: 1.7 }}>{s.late}</p>}
        {/* A CID attachment keeps the arrival credential off public image URLs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="cid:reservation-qr" alt={launchQrStrings[c.locale].alt} width={240} height={240} style={{ display: "block", maxWidth: "100%", height: "auto", background: "white" }} />
        <p style={{ lineHeight: 1.7 }}>{launchQrStrings[c.locale].instructions} {launchQrStrings[c.locale].fallback} {s.fallback}</p>
      </>}
      <p style={{ margin: "32px 0" }}><a href={url} style={{ color: "#EFE6E0", fontSize: 18 }}>{expires ? s.action : s.recovery}</a></p>
      {expires && <><p>{s.expires} {local(expires)}.</p><p>{s.expiredHelp} <a href={`${c.origin}/events/${c.night_id}`} style={{ color: "#EFE6E0" }}>{s.recovery}</a></p></>}
      <p style={{ lineHeight: 1.7 }}><a href="mailto:hello@getamourette.com" style={{ color: "#EFE6E0" }}>{s.help}</a></p>
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>{s.privacy}</p>
    </main></body></html> };
}

export async function renderReservationLifecycleEmail(context: LaunchMailContext, url: string, expires: string | null, qr: boolean) {
  const { subject, element } = ReservationLifecycleEmail({ context, url, expires, qr });
  return { subject, html: await render(element), text: await render(element, { plainText: true }) };
}
