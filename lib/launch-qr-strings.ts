import type { Locale } from "./strings";

export const launchQrStrings = {
  en: {
    title: "Your reservation QR",
    alt: "Personal reservation QR code to show to the team on arrival",
    instructions: "Show this QR to our team when you arrive. You may arrive at any time during the event.",
    reference: "Reservation reference",
    fallback: "If the QR cannot be scanned, our team can look up your reservation using this reference.",
    verified: "Your arrival has already been confirmed.",
  },
  fr: {
    title: "Ton QR d’arrivée",
    alt: "QR personnel de réservation à présenter à l’équipe à l’arrivée",
    instructions: "Montre ce QR à notre équipe en arrivant : ta caution est remboursée sur ta carte. Tu peux arriver quand tu veux pendant la soirée.",
    reference: "Référence de réservation",
    fallback: "Si le QR ne passe pas, donne cette référence à notre équipe.",
    verified: "Ton arrivée a déjà été confirmée.",
  },
  es: {
    title: "Tu QR de reserva",
    alt: "Código QR personal de reserva para mostrar al equipo a tu llegada",
    instructions: "Muestra este QR a nuestro equipo cuando llegues. Puedes llegar en cualquier momento durante el evento.",
    reference: "Referencia de reserva",
    fallback: "Si no se puede escanear el QR, nuestro equipo puede buscar tu reserva con esta referencia.",
    verified: "Tu llegada ya ha sido confirmada.",
  },
} satisfies Record<Locale, Record<string, string>>;
