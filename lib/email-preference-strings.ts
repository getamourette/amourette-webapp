import type { Locale } from "@/lib/strings";

export const emailPreferenceStrings: Record<Locale, {
  back: string;
  title: string;
  loading: string;
  noSubscription: string;
  subscribed: string;
  unsubscribed: string;
  emailLabel: string;
  emailPlaceholder: string;
  consent: string;
  subscribe: string;
  resubscribe: string;
  unsubscribe: string;
  saving: string;
  invalidEmail: string;
  error: string;
  privacyTitle: string;
  privacy: string;
  rights: string;
  contactPending: string;
  footerLink: string;
  publicTitle: string;
  publicConfirm: string;
  publicAction: string;
  publicUnsubscribed: string;
  publicAlready: string;
  publicInvalid: string;
  publicError: string;
}> = {
  en: {
    back: "Back to Amourette", title: "Email preferences", loading: "Loading your preferences…",
    noSubscription: "You are not currently subscribed to email updates.",
    subscribed: "You are subscribed to announcements about upcoming Amourette nights.",
    unsubscribed: "You are unsubscribed. You can opt in again at any time.",
    emailLabel: "Email address", emailPlaceholder: "you@example.com",
    consent: "I agree to receive optional marketing emails about upcoming Amourette nights.",
    subscribe: "Subscribe", resubscribe: "Subscribe again", unsubscribe: "Unsubscribe",
    saving: "Saving…", invalidEmail: "Enter a valid email address.",
    error: "We could not update your preferences. Please try again.", privacyTitle: "Your privacy",
    privacy: "We keep your normalized email address, language, consent source and timestamps only to send optional Amourette-night announcements and honor your choices. Withdrawal takes effect immediately; a minimal suppression record is retained to prevent accidental future mail.",
    rights: "You may request access, correction, objection or deletion, and you may lodge a complaint with your data-protection authority.",
    contactPending: "A privacy contact channel will be published before the service opens publicly.",
    footerLink: "Email preferences", publicTitle: "Unsubscribe from emails",
    publicConfirm: "Confirm that you no longer want announcements about upcoming Amourette nights. This applies to this email address everywhere it was used.",
    publicAction: "Confirm unsubscribe", publicUnsubscribed: "You have been unsubscribed from future emails.",
    publicAlready: "This address is already unsubscribed.",
    publicInvalid: "This unsubscribe link is invalid or has expired.",
    publicError: "We could not process your request. Please try again.",
  },
  fr: {
    back: "Retour à Amourette", title: "Préférences email", loading: "Chargement de vos préférences…",
    noSubscription: "Vous n’êtes actuellement inscrit·e à aucun email.",
    subscribed: "Vous êtes inscrit·e aux annonces des prochaines soirées Amourette.",
    unsubscribed: "Vous êtes désinscrit·e. Vous pouvez vous réinscrire à tout moment.",
    emailLabel: "Adresse email", emailPlaceholder: "vous@exemple.com",
    consent: "J’accepte de recevoir des emails marketing facultatifs sur les prochaines soirées Amourette.",
    subscribe: "S’inscrire", resubscribe: "Se réinscrire", unsubscribe: "Se désinscrire",
    saving: "Enregistrement…", invalidEmail: "Saisissez une adresse email valide.",
    error: "Impossible de mettre à jour vos préférences. Réessayez.", privacyTitle: "Votre vie privée",
    privacy: "Nous conservons votre adresse email normalisée, votre langue, la source et les dates du consentement uniquement pour envoyer des annonces facultatives et respecter vos choix. Le retrait est immédiat ; une trace minimale de suppression est conservée pour éviter tout envoi futur accidentel.",
    rights: "Vous pouvez demander l’accès, la rectification, vous opposer au traitement ou demander l’effacement, et saisir votre autorité de protection des données.",
    contactPending: "Un canal de contact dédié à la vie privée sera publié avant l’ouverture publique du service.",
    footerLink: "Préférences email", publicTitle: "Se désinscrire des emails",
    publicConfirm: "Confirmez que vous ne souhaitez plus recevoir les annonces des prochaines soirées Amourette. Ce choix s’applique partout où cette adresse a été utilisée.",
    publicAction: "Confirmer la désinscription", publicUnsubscribed: "Vous êtes désinscrit·e des futurs emails.",
    publicAlready: "Cette adresse est déjà désinscrite.",
    publicInvalid: "Ce lien de désinscription est invalide ou a expiré.",
    publicError: "Impossible de traiter votre demande. Réessayez.",
  },
  es: {
    back: "Volver a Amourette", title: "Preferencias de email", loading: "Cargando tus preferencias…",
    noSubscription: "Actualmente no estás suscrito a los emails.",
    subscribed: "Estás suscrito a los anuncios de las próximas noches de Amourette.",
    unsubscribed: "Te has dado de baja. Puedes volver a suscribirte en cualquier momento.",
    emailLabel: "Dirección de email", emailPlaceholder: "tu@ejemplo.com",
    consent: "Acepto recibir emails de marketing opcionales sobre las próximas noches de Amourette.",
    subscribe: "Suscribirme", resubscribe: "Volver a suscribirme", unsubscribe: "Darme de baja",
    saving: "Guardando…", invalidEmail: "Introduce una dirección de email válida.",
    error: "No hemos podido actualizar tus preferencias. Inténtalo de nuevo.", privacyTitle: "Tu privacidad",
    privacy: "Conservamos tu dirección normalizada, idioma, fuente y fechas del consentimiento solo para enviar anuncios opcionales y respetar tus decisiones. La baja es inmediata; conservamos un registro mínimo de supresión para evitar futuros envíos accidentales.",
    rights: "Puedes solicitar acceso, rectificación, oposición o supresión, y reclamar ante tu autoridad de protección de datos.",
    contactPending: "Publicaremos un canal de privacidad antes de abrir el servicio al público.",
    footerLink: "Preferencias de email", publicTitle: "Darse de baja de los emails",
    publicConfirm: "Confirma que ya no quieres recibir anuncios sobre las próximas noches de Amourette. Se aplicará en todos los lugares donde se haya usado esta dirección.",
    publicAction: "Confirmar la baja", publicUnsubscribed: "Te has dado de baja de futuros emails.",
    publicAlready: "Esta dirección ya está dada de baja.",
    publicInvalid: "Este enlace de baja no es válido o ha caducado.",
    publicError: "No hemos podido procesar tu solicitud. Inténtalo de nuevo.",
  },
};
