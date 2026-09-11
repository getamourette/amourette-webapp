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
    noSubscription: "You’re not subscribed to announcements about upcoming Amourette nights.",
    subscribed: "You’re subscribed to announcements about upcoming Amourette nights.",
    unsubscribed: "You’ve unsubscribed. You can subscribe again at any time.",
    emailLabel: "Email address", emailPlaceholder: "you@example.com",
    consent: "I agree to receive email announcements about upcoming Amourette nights. I can unsubscribe at any time.",
    subscribe: "Subscribe", resubscribe: "Subscribe again", unsubscribe: "Unsubscribe",
    saving: "Saving…", invalidEmail: "Enter a valid email address.",
    error: "Couldn’t update your preferences. Try again.", privacyTitle: "Your privacy",
    privacy: "We keep your email address, language, and the source and dates of your consent only to send you these optional announcements and respect your choices. Unsubscribing takes effect immediately. We keep a minimal record of it to avoid emailing you again by mistake.",
    rights: "You can request access to your data, its correction or deletion, object to its processing, and lodge a complaint with your data-protection authority.",
    contactPending: "A privacy contact channel will be published before the service opens publicly.",
    footerLink: "Email preferences", publicTitle: "Unsubscribe from emails",
    publicConfirm: "Confirm that you no longer want announcements about upcoming Amourette nights. This choice applies everywhere this email address has been used.",
    publicAction: "Confirm unsubscribe", publicUnsubscribed: "You’ve unsubscribed from announcements about upcoming Amourette nights.",
    publicAlready: "This email address is already unsubscribed.",
    publicInvalid: "This unsubscribe link is invalid or has expired.",
    publicError: "Couldn’t process your request. Refresh the page to try again.",
  },
  fr: {
    back: "Retour à Amourette", title: "Préférences email", loading: "Chargement de tes préférences…",
    noSubscription: "Tu n’es pas inscrit·e aux annonces des prochaines soirées Amourette.",
    subscribed: "Tu es inscrit·e aux annonces des prochaines soirées Amourette.",
    unsubscribed: "Tu es désinscrit·e. Tu peux te réinscrire à tout moment.",
    emailLabel: "Adresse email", emailPlaceholder: "toi@exemple.com",
    consent: "J’accepte de recevoir par email les annonces des prochaines soirées Amourette. Je pourrai me désinscrire à tout moment.",
    subscribe: "M’inscrire", resubscribe: "Me réinscrire", unsubscribe: "Me désinscrire",
    saving: "Enregistrement…", invalidEmail: "Entre une adresse email valide.",
    error: "Impossible de mettre à jour tes préférences. Réessaie.", privacyTitle: "Ta vie privée",
    privacy: "Nous conservons ton adresse email, ta langue, ainsi que l’origine et les dates de ton consentement uniquement pour t’envoyer ces annonces facultatives et respecter tes choix. Ta désinscription prend effet immédiatement. Nous en conservons une trace minimale pour éviter de te renvoyer des emails par erreur.",
    rights: "Tu peux demander l’accès à tes données, leur rectification ou leur effacement, t’opposer à leur traitement et saisir ton autorité de protection des données.",
    contactPending: "Un canal de contact dédié à la vie privée sera publié avant l’ouverture publique du service.",
    footerLink: "Préférences email", publicTitle: "Se désinscrire des emails",
    publicConfirm: "Confirme que tu ne souhaites plus recevoir les annonces des prochaines soirées Amourette. Ce choix s’applique partout où cette adresse email a été utilisée.",
    publicAction: "Confirmer la désinscription", publicUnsubscribed: "Tu es désinscrit·e des annonces des prochaines soirées Amourette.",
    publicAlready: "Cette adresse email est déjà désinscrite.",
    publicInvalid: "Ce lien de désinscription est invalide ou a expiré.",
    publicError: "Impossible de traiter ta demande. Actualise la page pour réessayer.",
  },
  es: {
    back: "Volver a Amourette", title: "Preferencias de email", loading: "Cargando tus preferencias…",
    noSubscription: "No tienes una suscripción a los anuncios de las próximas noches de Amourette.",
    subscribed: "Tienes una suscripción a los anuncios de las próximas noches de Amourette.",
    unsubscribed: "Te has dado de baja. Puedes volver a suscribirte en cualquier momento.",
    emailLabel: "Dirección de email", emailPlaceholder: "tu@ejemplo.com",
    consent: "Acepto recibir por email anuncios de las próximas noches de Amourette. Podré darme de baja en cualquier momento.",
    subscribe: "Suscribirme", resubscribe: "Volver a suscribirme", unsubscribe: "Darme de baja",
    saving: "Guardando…", invalidEmail: "Introduce una dirección de email válida.",
    error: "No se han podido actualizar tus preferencias. Inténtalo de nuevo.", privacyTitle: "Tu privacidad",
    privacy: "Conservamos tu dirección de email, tu idioma, y el origen y las fechas de tu consentimiento únicamente para enviarte estos anuncios opcionales y respetar tus decisiones. La baja tiene efecto inmediato. Conservamos un registro mínimo para evitar volver a enviarte emails por error.",
    rights: "Puedes solicitar el acceso a tus datos, su rectificación o supresión, oponerte a su tratamiento y presentar una reclamación ante tu autoridad de protección de datos.",
    contactPending: "Publicaremos un canal de contacto dedicado a la privacidad antes de abrir el servicio al público.",
    footerLink: "Preferencias de email", publicTitle: "Darse de baja de los emails",
    publicConfirm: "Confirma que ya no quieres recibir anuncios sobre las próximas noches de Amourette. Esta decisión se aplica en todos los lugares donde se haya usado esta dirección de email.",
    publicAction: "Confirmar la baja", publicUnsubscribed: "Te has dado de baja de los anuncios de las próximas noches de Amourette.",
    publicAlready: "Esta dirección de email ya está dada de baja.",
    publicInvalid: "Este enlace de baja no es válido o ha caducado.",
    publicError: "No se ha podido procesar tu solicitud. Actualiza la página para intentarlo de nuevo.",
  },
};
