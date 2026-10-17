import type { Locale } from "./strings";
const en = {
  title: "Cancel my reservation", confirm: "Confirm cancellation", keep: "Keep my reservation", loading: "Please wait…", refresh: "Check current reservation",
  existingRefund: "The refund already requested will be preserved. Cancellation does not create another refund.",
  deadline: "Free cancellation until", full: "Your full {amount} deposit will be refunded. Bank processing may take several business days.",
  retained: "The free-cancellation deadline has passed. If you cancel now, your {amount} deposit will be retained.",
  effects: "Cancellation releases your place and invalidates your arrival QR. Reserving again requires a new deposit and an available place while booking is open.",
  crossed: "The free-cancellation deadline has just passed. Your reservation has not been cancelled. Confirm again only if you accept that your deposit will be retained.",
  unavailable: "This reservation can no longer be cancelled. Check its current status. For an exception, email hello@getamourette.com with your reservation reference and a short explanation.",
  unknown: "We could not confirm the outcome. Check the current reservation before trying again.", access: "Your access has expired or is no longer valid. Request a new personal link.",
  cancelled: "Your place has been released and your arrival QR is no longer valid.", retainedOutcome: "Your deposit is retained under the cancellation policy. A replacement booking does not change this outcome. For an exception, email hello@getamourette.com with your reference and a short explanation.",
};
export const cancellationStrings: Record<Locale, typeof en> = {
  en,
  fr: {
    title: "Annuler ma réservation", confirm: "Confirmer l’annulation", keep: "Garder ma réservation", loading: "Veuillez patienter…", refresh: "Vérifier la réservation actuelle",
    existingRefund: "Le remboursement déjà demandé est conservé. L’annulation ne crée pas un autre remboursement.",
    deadline: "Annulation gratuite jusqu’au", full: "Votre dépôt de {amount} sera intégralement remboursé. Le traitement bancaire peut prendre plusieurs jours ouvrés.",
    retained: "Le délai d’annulation gratuite est dépassé. Si vous annulez maintenant, votre dépôt de {amount} sera conservé.",
    effects: "L’annulation libère votre place et invalide votre QR d’arrivée. Réserver à nouveau nécessite un nouveau dépôt et une place disponible pendant l’ouverture des réservations.",
    crossed: "Le délai d’annulation gratuite vient de se terminer. Votre réservation n’a pas été annulée. Confirmez à nouveau uniquement si vous acceptez que votre dépôt soit conservé.",
    unavailable: "Cette réservation ne peut plus être annulée. Vérifiez son état actuel. Pour demander une exception, écrivez à hello@getamourette.com avec votre référence et une courte explication.",
    unknown: "Nous n’avons pas pu confirmer le résultat. Vérifiez l’état actuel de la réservation avant de réessayer.", access: "Votre accès a expiré ou n’est plus valide. Demandez un nouveau lien personnel.",
    cancelled: "Votre place a été libérée et votre QR d’arrivée n’est plus valide.", retainedOutcome: "Votre dépôt est conservé selon les conditions d’annulation. Une réservation de remplacement ne change pas ce résultat. Pour demander une exception, écrivez à hello@getamourette.com avec votre référence et une courte explication.",
  },
  es: {
    title: "Cancelar mi reserva", confirm: "Confirmar cancelación", keep: "Conservar mi reserva", loading: "Espera un momento…", refresh: "Comprobar la reserva actual",
    existingRefund: "Se mantiene el reembolso ya solicitado. La cancelación no crea otro reembolso.",
    deadline: "Cancelación gratuita hasta", full: "Tu depósito de {amount} se reembolsará íntegramente. La tramitación bancaria puede tardar varios días hábiles.",
    retained: "El plazo de cancelación gratuita ha terminado. Si cancelas ahora, conservaremos tu depósito de {amount}.",
    effects: "La cancelación libera tu plaza e invalida tu QR de llegada. Para reservar de nuevo necesitas otro depósito y una plaza disponible mientras las reservas estén abiertas.",
    crossed: "El plazo de cancelación gratuita acaba de terminar. Tu reserva no se ha cancelado. Confirma de nuevo solo si aceptas que conservemos tu depósito.",
    unavailable: "Esta reserva ya no se puede cancelar. Comprueba su estado actual. Para solicitar una excepción, escribe a hello@getamourette.com con tu referencia y una breve explicación.",
    unknown: "No hemos podido confirmar el resultado. Comprueba la reserva actual antes de volver a intentarlo.", access: "Tu acceso ha caducado o ya no es válido. Solicita otro enlace personal.",
    cancelled: "Tu plaza se ha liberado y tu QR de llegada ya no es válido.", retainedOutcome: "Tu depósito se conserva según las condiciones de cancelación. Una reserva de reemplazo no cambia este resultado. Para solicitar una excepción, escribe a hello@getamourette.com con tu referencia y una breve explicación.",
  },
};
