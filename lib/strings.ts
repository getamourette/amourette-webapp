// Lightweight FR/EN/ES UI dictionary (see docs/decisions.md, 2026-06-19).
// No i18n framework yet: the app is a handful of screens, so a single typed
// dictionary is the cheap insurance that a later switch is a one-file change,
// not a hunt across components. Code stays English; only displayed strings live
// here. The brand name "Amourette" is never localized and stays inline in the UI.
//
// Locale defaults to the venue's city inside a room (Paris -> fr, NYC -> en)
// and to the browser language on the pre-venue pages (landing, profile). A
// user-selected language can override either default.

export const SUPPORTED_LOCALES = ["en", "fr", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}

// Cities whose room is shown in French. Extend as venues grow; everything else
// defaults to English.
const FRENCH_CITIES = new Set(["paris"]);

export function localeForCity(city: string | null | undefined): Locale {
  if (city && FRENCH_CITIES.has(city.trim().toLowerCase())) return "fr";
  return "en";
}

// Browser-language fallback for pages reached before a venue is known.
export function browserLocale(): Locale {
  const language = typeof navigator !== "undefined"
    ? navigator.language?.toLowerCase()
    : "";
  if (language?.startsWith("fr")) {
    return "fr";
  }
  if (language?.startsWith("es")) {
    return "es";
  }
  return "en";
}

type Dict = {
  landing: {
    welcome: string;
    tagline: string;
    settingUp: string;
    sessionError: string;
    // Returning-user gate (see docs/decisions.md, 2026-07-01).
    welcomeBack: string;
    newVisitorLead: string;
    returningLead: string;
    yourProfile: string;
    editProfile: string;
    activeChatTitle: string;
    openChatWith: (name: string) => string;
    devEnterVenue: string;
  };
  profile: {
    title: string;
    subtitle: string;
    // Edit mode (returning user updating an existing profile).
    editTitle: string;
    editSubtitle: string;
    saveChanges: string;
    back: string;
    tonightAt: (venue: string) => string;
    ageTitle: string;
    ageSubtitle: string;
    trustPills: string[];
    addPhoto: string;
    firstName: string;
    bioOptional: string;
    iAm: string;
    iWantToMeet: string;
    adultConfirm: string;
    save: string;
    saving: string;
    sessionError: string;
    needFirstName: string;
    needPhoto: string;
    needGender: string;
    needInterest: string;
    needAdult: string;
    photoInvalidType: string;
    photoTooLarge: string;
    photoRejected: string;
    photoReviewFailed: string;
    photoUploadFailed: string;
    genericError: string;
  };
  genders: { woman: string; man: string; nonbinary: string };
  room: {
    entering: string;
    loadError: string;
    venueNotFound: string;
    // The venue exists but is_live is false: the night has not started (or is
    // over). The page reopens itself via realtime when the founder goes live.
    closedTitle: string;
    closedBody: string;
    // takes the venue name
    whosHere: (venue: string) => string;
    justArrived: string;
    newArrivalCue: string;
    profileActions: string;
    roomActions: string;
    editProfile: string;
    firstTimeHintTitle: string;
    firstTimeHintBody: string;
    firstTimeHintDismiss: string;
    emailPromptTitle: string;
    emailPromptBody: string;
    emailPromptPlaceholder: string;
    emailPromptConsent: string;
    emailPromptSubmit: string;
    emailPromptSaving: string;
    emailPromptNotNow: string;
    emailPromptClose: string;
    emailPromptSuccess: string;
    emailPromptError: string;
    // Waiting state: the room is real but no compatible profile yet. The
    // count itself is rendered as a big numeral; this is the label under it.
    roomCount: (count: number) => string;
    // Compact live status on the feed card header (red dot + this). Includes the
    // numeral inline, e.g. "23 in the room" — shorter than roomCount's sentence.
    liveStatus: (count: number) => string;
    waitingTitle: string;
    waitingBody: string;
    polishProfile: string;
    like: string;
    liked: string;
    likeError: string;
    leave: string;
    goInvisible: string;
    invisibleTitle: string;
    invisibleBody: string;
    becomeVisible: string;
    visibilityError: string;
    matchKicker: string;
    matchBody: string;
    matchDismiss: string;
    leftTitle: string;
    leftBody: string;
    rejoin: string;
    chat: string;
    openChat: string;
    activeMatches: string;
    conversationHint: string;
    openConversation: (name: string) => string;
    block: string;
    blockTitle: (name: string) => string;
    blockSubmit: string;
    blockConfirm: (name: string) => string;
    blockError: string;
    report: string;
    reportTitle: (name: string) => string;
    reportReason: string;
    reportNote: string;
    reportSubmit: string;
    reportCancel: string;
    reportSuccess: string;
    reportError: string;
    reportBlockPrompt: string;
    reportReasons: {
      harassment: string;
      fake_profile: string;
      underage: string;
      unsafe_behavior: string;
      other: string;
    };
  };
  chat: {
    loading: string;
    unavailable: string;
    backToRoom: string;
    expiresTonight: string;
    empty: string;
    typing: (name: string) => string;
    placeholder: string;
    send: string;
    sendError: string;
    closed: string;
  };
};

export const t: Record<Locale, Dict> = {
  en: {
    landing: {
      welcome: "Inside the room",
      tagline: "Scan. Tap. Start your night.",
      settingUp: "Opening the room…",
      sessionError:
        "Couldn't start your session. Anonymous sign-in may be disabled for this project.",
      welcomeBack: "Welcome back",
      newVisitorLead: "Scan the QR at the bar to join the night.",
      returningLead: "Scan your bar's QR to check in tonight.",
      yourProfile: "Your profile",
      editProfile: "Edit my profile",
      activeChatTitle: "Still on tonight",
      openChatWith: (name) => `Open your chat with ${name}`,
      devEnterVenue: "Dev · enter test venue",
    },
    profile: {
      title: "Your profile is your vibe",
      subtitle: "A real first name, a clear photo, and the energy you bring.",
      editTitle: "Edit your profile",
      editSubtitle: "Update your photo, name, bio, or who you want to meet.",
      saveChanges: "Save changes",
      back: "Back",
      tonightAt: (venue) => `Tonight at ${venue}`,
      ageTitle: "Confirm your age",
      ageSubtitle: "Good energy only. Amourette is for adults.",
      trustPills: ["Discreet taps", "Mutual only", "You stay in control"],
      addPhoto: "Add Photo",
      firstName: "First name",
      bioOptional: "Bio (optional)",
      iAm: "I am",
      iWantToMeet: "I want to meet",
      adultConfirm: "I confirm that I am 18 or older.",
      save: "Enter the room",
      saving: "Saving…",
      sessionError: "Couldn't start your session. Try again.",
      needFirstName: "Please enter your first name.",
      needPhoto: "Please add a profile picture.",
      needGender: "Please select your gender.",
      needInterest: "Please select who you'd like to meet.",
      needAdult: "Please confirm that you are 18 or older.",
      photoInvalidType: "Please use a JPG, PNG, or WebP photo.",
      photoTooLarge: "Please use a photo under 5 MB.",
      photoRejected:
        "Please use a clear real photo of your face. No blank images, memes, screenshots, group photos, or hidden faces.",
      photoReviewFailed: "Couldn't check your photo. Try again.",
      photoUploadFailed: "Photo upload failed.",
      genericError: "Something went wrong. Try again.",
    },
    genders: { woman: "Woman", man: "Man", nonbinary: "Non-binary" },
    room: {
      entering: "Walking into the room…",
      loadError: "Couldn't load the room. Anonymous sign-in may be disabled.",
      venueNotFound: "This venue doesn't exist.",
      closedTitle: "The night hasn't started yet",
      closedBody:
        "This bar isn't live on Amourette right now. Come back when the night kicks off — this page will open on its own.",
      whosHere: (venue) => `Tonight at ${venue}`,
      justArrived: "Just arrived",
      newArrivalCue: "Someone just arrived ↓",
      profileActions: "More actions",
      roomActions: "Room options",
      editProfile: "Edit my profile",
      firstTimeHintTitle: "Tap quietly",
      firstTimeHintBody:
        "They only know if it is mutual. You stay in control of your attention.",
      firstTimeHintDismiss: "Got it",
      emailPromptTitle: "Do it again soon?",
      emailPromptBody:
        "Leave your email to hear about upcoming Amourette nights.",
      emailPromptPlaceholder: "you@example.com",
      emailPromptConsent:
        "I agree to receive announcements about upcoming Amourette nights by email. I can unsubscribe at any time.",
      emailPromptSubmit: "Keep me posted",
      emailPromptSaving: "Saving…",
      emailPromptNotNow: "Not now",
      emailPromptClose: "Close email signup",
      emailPromptSuccess: "You're on the list — enjoy your night ✨",
      emailPromptError: "Couldn't save your email. Try again.",
      roomCount: (count) =>
        count === 1
          ? "person in the room right now — that's you"
          : "people in the room right now, counting you",
      liveStatus: (count) => `${count} in the room`,
      waitingTitle: "You're in",
      waitingBody:
        "The night is warming up. Put your phone away, enjoy your bar — check back in a bit.",
      polishProfile: "Polish your profile while the room fills",
      like: "Tap",
      liked: "Tapped",
      likeError: "Couldn't register your like. Try again.",
      leave: "Leave for the night",
      goInvisible: "Go invisible",
      invisibleTitle: "You're invisible",
      invisibleBody:
        "You're not visible in this room, and browsing is paused until you come back.",
      becomeVisible: "Become visible",
      visibilityError: "Couldn't update your visibility. Try again.",
      matchKicker: "Mutual energy",
      matchBody: "You both tapped. Keep it light, respectful, and in the moment.",
      matchDismiss: "See who else is here",
      leftTitle: "You've left the room",
      leftBody: "You're no longer visible here. Come back whenever you like.",
      rejoin: "Re-join the room",
      chat: "Open",
      openChat: "Start the chat",
      activeMatches: "Conversations",
      conversationHint: "Mutual taps live here. Keep it warm, then say hi.",
      openConversation: (name) => `Open conversation with ${name}`,
      block: "Block",
      blockTitle: (name) => `Block ${name}`,
      blockSubmit: "Block this person",
      blockConfirm: (name) =>
        `Block ${name}? You will no longer see each other, and any match or chat will close.`,
      blockError: "Couldn't block this person. Try again.",
      report: "Report",
      reportTitle: (name) => `Report ${name}`,
      reportReason: "Reason",
      reportNote: "Add a note (optional)",
      reportSubmit: "Submit report",
      reportCancel: "Cancel",
      reportSuccess: "Report submitted.",
      reportError: "Couldn't submit the report. Try again.",
      reportBlockPrompt: "Do you also want to block this person?",
      reportReasons: {
        harassment: "Harassment",
        fake_profile: "Fake profile",
        underage: "Underage",
        unsafe_behavior: "Unsafe behavior",
        other: "Other",
      },
    },
    chat: {
      loading: "Opening chat…",
      unavailable: "This chat is not available.",
      backToRoom: "Back to the room",
      expiresTonight: "Open for tonight.",
      empty: "No messages yet. Keep it warm, short, and respectful.",
      typing: (name) => `${name} is typing…`,
      placeholder: "Write a short message…",
      send: "Send",
      sendError: "Couldn't send your message. Try again.",
      closed: "This match has expired for the night.",
    },
  },
  fr: {
    landing: {
      welcome: "Dans la salle",
      tagline: "Scanne. Craque. Commence ta soirée.",
      settingUp: "On ouvre la salle…",
      sessionError:
        "Impossible de démarrer ta session. La connexion anonyme est peut-être désactivée.",
      welcomeBack: "Content de te revoir",
      newVisitorLead: "Scanne le QR à l'entrée du bar pour rejoindre la soirée.",
      returningLead: "Scanne le QR de ton bar pour te check-in ce soir.",
      yourProfile: "Ton profil",
      editProfile: "Modifier mon profil",
      activeChatTitle: "Encore en cours ce soir",
      openChatWith: (name) => `Ouvrir ton chat avec ${name}`,
      devEnterVenue: "Dev · entrer dans le lieu de test",
    },
    profile: {
      title: "Ton profil, ton énergie",
      subtitle: "Un vrai prénom, une photo claire, et l'énergie que tu amènes.",
      editTitle: "Modifier ton profil",
      editSubtitle: "Mets à jour ta photo, ton prénom, ta bio ou qui tu veux rencontrer.",
      saveChanges: "Enregistrer les modifications",
      back: "Retour",
      tonightAt: (venue) => `Ce soir à ${venue}`,
      ageTitle: "Confirme ton âge",
      ageSubtitle: "Bonne énergie seulement. Amourette est réservé aux adultes.",
      trustPills: [
        "Coups de cœur discrets",
        "Mutuel seulement",
        "Tu gardes le contrôle",
      ],
      addPhoto: "Ajouter une photo",
      firstName: "Prénom",
      bioOptional: "Bio (optionnel)",
      iAm: "Je suis",
      iWantToMeet: "Je veux rencontrer",
      adultConfirm: "Je confirme avoir 18 ans ou plus.",
      save: "Entrer dans la salle",
      saving: "Enregistrement…",
      sessionError: "Impossible de démarrer ta session. Réessaie.",
      needFirstName: "Entre ton prénom.",
      needPhoto: "Ajoute une photo de profil.",
      needGender: "Choisis ton genre.",
      needInterest: "Choisis qui tu veux rencontrer.",
      needAdult: "Confirme que tu as 18 ans ou plus.",
      photoInvalidType: "Utilise une photo JPG, PNG ou WebP.",
      photoTooLarge: "Utilise une photo de moins de 5 Mo.",
      photoRejected:
        "Utilise une vraie photo claire de ton visage. Pas d'image vide, meme, capture d'écran, photo de groupe ou visage caché.",
      photoReviewFailed: "Impossible de vérifier ta photo. Réessaie.",
      photoUploadFailed: "L'envoi de la photo a échoué.",
      genericError: "Un problème est survenu. Réessaie.",
    },
    genders: { woman: "Femme", man: "Homme", nonbinary: "Non-binaire" },
    room: {
      entering: "On entre dans la salle…",
      loadError:
        "Impossible de charger la salle. La connexion anonyme est peut-être désactivée.",
      venueNotFound: "Ce lieu n'existe pas.",
      closedTitle: "La soirée n'a pas encore commencé",
      closedBody:
        "Ce bar n'est pas encore ouvert sur Amourette ce soir. Reviens quand la soirée se lance — cette page s'ouvrira toute seule.",
      whosHere: (venue) => `Ce soir à ${venue}`,
      justArrived: "Vient d'arriver",
      newArrivalCue: "Quelqu'un vient d'arriver ↓",
      profileActions: "Plus d'actions",
      roomActions: "Options de la salle",
      editProfile: "Modifier mon profil",
      firstTimeHintTitle: "Craque discrètement",
      firstTimeHintBody:
        "La personne ne le sait que si c'est mutuel. Tu gardes le contrôle de ton attention.",
      firstTimeHintDismiss: "Compris",
      emailPromptTitle: "On remet ça bientôt ?",
      emailPromptBody:
        "Laisse ton email pour être prévenu·e des prochaines soirées Amourette.",
      emailPromptPlaceholder: "toi@exemple.com",
      emailPromptConsent:
        "J'accepte de recevoir par email les annonces des prochaines soirées Amourette. Je pourrai me désinscrire à tout moment.",
      emailPromptSubmit: "Me prévenir",
      emailPromptSaving: "Enregistrement…",
      emailPromptNotNow: "Pas maintenant",
      emailPromptClose: "Fermer l'inscription par email",
      emailPromptSuccess: "C'est noté — profite de ta soirée ✨",
      emailPromptError: "Impossible d'enregistrer ton email. Réessaie.",
      roomCount: (count) =>
        count > 1
          ? "personnes dans la salle en ce moment, en te comptant"
          : "personne dans la salle en ce moment — c'est toi",
      liveStatus: (count) => `${count} dans la salle`,
      waitingTitle: "Tu es dedans",
      waitingBody:
        "La soirée se lance. Range ton téléphone, profite de ton bar — reviens voir dans un moment.",
      polishProfile: "Peaufine ton profil pendant que la salle se remplit",
      like: "Craquer",
      liked: "Craqué",
      likeError: "Ton coup de cœur n'a pas pu être enregistré. Réessaie.",
      leave: "Quitter la soirée",
      goInvisible: "Passer invisible",
      invisibleTitle: "Tu es invisible",
      invisibleBody:
        "Tu n'apparais plus dans cette salle, et l'exploration est en pause jusqu'à ton retour.",
      becomeVisible: "Redevenir visible",
      visibilityError: "Impossible de changer ta visibilité. Réessaie.",
      matchKicker: "Énergie mutuelle",
      matchBody:
        "Vous avez craqué l'un pour l'autre. Reste léger, respectueux, et dans le moment.",
      matchDismiss: "Voir qui est là",
      leftTitle: "Tu as quitté la salle",
      leftBody: "Tu n'es plus visible ici. Reviens quand tu veux.",
      rejoin: "Revenir dans la salle",
      chat: "Ouvrir",
      openChat: "Démarrer le chat",
      activeMatches: "Conversations",
      conversationHint:
        "Les coups de cœur mutuels vivent ici. Reste chaleureux, puis va dire bonjour.",
      openConversation: (name) => `Ouvrir la conversation avec ${name}`,
      block: "Bloquer",
      blockTitle: (name) => `Bloquer ${name}`,
      blockSubmit: "Bloquer cette personne",
      blockConfirm: (name) =>
        `Bloquer ${name} ? Vous ne vous verrez plus, et tout match ou chat sera fermé.`,
      blockError: "Impossible de bloquer cette personne. Réessaie.",
      report: "Signaler",
      reportTitle: (name) => `Signaler ${name}`,
      reportReason: "Raison",
      reportNote: "Ajouter une note (optionnel)",
      reportSubmit: "Envoyer le signalement",
      reportCancel: "Annuler",
      reportSuccess: "Signalement envoyé.",
      reportError: "Impossible d'envoyer le signalement. Réessaie.",
      reportBlockPrompt: "Veux-tu aussi bloquer cette personne ?",
      reportReasons: {
        harassment: "Harcèlement",
        fake_profile: "Faux profil",
        underage: "Mineur",
        unsafe_behavior: "Comportement dangereux",
        other: "Autre",
      },
    },
    chat: {
      loading: "Ouverture du chat…",
      unavailable: "Ce chat n'est pas disponible.",
      backToRoom: "Retour à la salle",
      expiresTonight: "Ouvert pour ce soir.",
      empty: "Aucun message pour l'instant. Reste chaleureux, court et respectueux.",
      typing: (name) => `${name} écrit…`,
      placeholder: "Écris un message court…",
      send: "Envoyer",
      sendError: "Impossible d'envoyer ton message. Réessaie.",
      closed: "Ce match a expiré pour la soirée.",
    },
  },
  es: {
    landing: {
      welcome: "Dentro de la sala",
      tagline: "Escanea. Flecha. Empieza tu noche.",
      settingUp: "Abriendo la sala…",
      sessionError:
        "No se pudo iniciar tu sesión. Puede que el inicio anónimo esté desactivado.",
      welcomeBack: "Bienvenido de nuevo",
      newVisitorLead: "Escanea el QR en la entrada del bar para unirte a la noche.",
      returningLead: "Escanea el QR de tu bar para registrarte esta noche.",
      yourProfile: "Tu perfil",
      editProfile: "Editar mi perfil",
      activeChatTitle: "Sigue activo esta noche",
      openChatWith: (name) => `Abrir tu chat con ${name}`,
      devEnterVenue: "Dev · entrar al lugar de prueba",
    },
    profile: {
      title: "Tu perfil es tu vibra",
      subtitle: "Un nombre real, una foto clara y la energía que traes.",
      editTitle: "Editar tu perfil",
      editSubtitle: "Actualiza tu foto, tu nombre, tu bio o a quién quieres conocer.",
      saveChanges: "Guardar cambios",
      back: "Volver",
      tonightAt: (venue) => `Esta noche en ${venue}`,
      ageTitle: "Confirma tu edad",
      ageSubtitle: "Solo buena energía. Amourette es para adultos.",
      trustPills: ["Flechazos discretos", "Solo mutuo", "Tú tienes el control"],
      addPhoto: "Añadir foto",
      firstName: "Nombre",
      bioOptional: "Bio (opcional)",
      iAm: "Soy",
      iWantToMeet: "Quiero conocer",
      adultConfirm: "Confirmo que tengo 18 años o más.",
      save: "Entrar en la sala",
      saving: "Guardando…",
      sessionError: "No se pudo iniciar tu sesión. Inténtalo de nuevo.",
      needFirstName: "Introduce tu nombre.",
      needPhoto: "Añade una foto de perfil.",
      needGender: "Selecciona tu género.",
      needInterest: "Selecciona a quién quieres conocer.",
      needAdult: "Confirma que tienes 18 años o más.",
      photoInvalidType: "Usa una foto JPG, PNG o WebP.",
      photoTooLarge: "Usa una foto de menos de 5 MB.",
      photoRejected:
        "Usa una foto real y clara de tu cara. Sin imágenes vacías, memes, capturas, fotos de grupo ni caras ocultas.",
      photoReviewFailed: "No se pudo revisar tu foto. Inténtalo de nuevo.",
      photoUploadFailed: "La subida de la foto falló.",
      genericError: "Algo salió mal. Inténtalo de nuevo.",
    },
    genders: { woman: "Mujer", man: "Hombre", nonbinary: "No binario" },
    room: {
      entering: "Entrando en la sala…",
      loadError:
        "No se pudo cargar la sala. Puede que el inicio anónimo esté desactivado.",
      venueNotFound: "Este lugar no existe.",
      closedTitle: "La noche aún no ha empezado",
      closedBody:
        "Este bar todavía no está abierto en Amourette esta noche. Vuelve cuando arranque la noche — esta página se abrirá sola.",
      whosHere: (venue) => `Esta noche en ${venue}`,
      justArrived: "Acaba de llegar",
      newArrivalCue: "Alguien acaba de llegar ↓",
      profileActions: "Más acciones",
      roomActions: "Opciones de la sala",
      editProfile: "Editar mi perfil",
      firstTimeHintTitle: "Flecha con discreción",
      firstTimeHintBody:
        "Solo lo sabrán si es mutuo. Tú controlas tu atención.",
      firstTimeHintDismiss: "Entendido",
      emailPromptTitle: "¿Repetimos pronto?",
      emailPromptBody:
        "Deja tu email para enterarte de las próximas noches de Amourette.",
      emailPromptPlaceholder: "tu@ejemplo.com",
      emailPromptConsent:
        "Acepto recibir por email anuncios sobre las próximas noches de Amourette. Puedo darme de baja en cualquier momento.",
      emailPromptSubmit: "Avísame",
      emailPromptSaving: "Guardando…",
      emailPromptNotNow: "Ahora no",
      emailPromptClose: "Cerrar el registro por email",
      emailPromptSuccess: "Anotado — disfruta de tu noche ✨",
      emailPromptError: "No se pudo guardar tu email. Inténtalo de nuevo.",
      roomCount: (count) =>
        count === 1
          ? "persona en la sala ahora mismo — eres tú"
          : "personas en la sala ahora mismo, contándote a ti",
      liveStatus: (count) => `${count} en la sala`,
      waitingTitle: "Ya estás dentro",
      waitingBody:
        "La noche está arrancando. Guarda el teléfono, disfruta de tu bar — vuelve a mirar en un rato.",
      polishProfile: "Pule tu perfil mientras la sala se llena",
      like: "Flechar",
      liked: "Flechado",
      likeError: "No se pudo registrar tu flechazo. Inténtalo de nuevo.",
      leave: "Salir por esta noche",
      goInvisible: "Pasar a invisible",
      invisibleTitle: "Estás invisible",
      invisibleBody:
        "No eres visible en esta sala y la exploración se pausa hasta que vuelvas.",
      becomeVisible: "Volver a ser visible",
      visibilityError: "No se pudo cambiar tu visibilidad. Inténtalo de nuevo.",
      matchKicker: "Flechazo mutuo",
      matchBody:
        "Os habéis flechado. Manténlo ligero, respetuoso y en el momento.",
      matchDismiss: "Ver quién más está aquí",
      leftTitle: "Has salido de la sala",
      leftBody: "Ya no eres visible aquí. Vuelve cuando quieras.",
      rejoin: "Volver a la sala",
      chat: "Abrir",
      openChat: "Iniciar el chat",
      activeMatches: "Conversaciones",
      conversationHint:
        "Los flechazos mutuos viven aquí. Manténlo cálido y luego ve a saludar.",
      openConversation: (name) => `Abrir conversación con ${name}`,
      block: "Bloquear",
      blockTitle: (name) => `Bloquear a ${name}`,
      blockSubmit: "Bloquear a esta persona",
      blockConfirm: (name) =>
        `¿Bloquear a ${name}? Ya no se verán, y cualquier match o chat se cerrará.`,
      blockError: "No se pudo bloquear a esta persona. Inténtalo de nuevo.",
      report: "Reportar",
      reportTitle: (name) => `Reportar a ${name}`,
      reportReason: "Razón",
      reportNote: "Añadir una nota (opcional)",
      reportSubmit: "Enviar reporte",
      reportCancel: "Cancelar",
      reportSuccess: "Reporte enviado.",
      reportError: "No se pudo enviar el reporte. Inténtalo de nuevo.",
      reportBlockPrompt: "¿También quieres bloquear a esta persona?",
      reportReasons: {
        harassment: "Acoso",
        fake_profile: "Perfil falso",
        underage: "Menor de edad",
        unsafe_behavior: "Comportamiento inseguro",
        other: "Otro",
      },
    },
    chat: {
      loading: "Abriendo el chat…",
      unavailable: "Este chat no está disponible.",
      backToRoom: "Volver a la sala",
      expiresTonight: "Abierto por esta noche.",
      empty: "Aún no hay mensajes. Manténlo cálido, corto y respetuoso.",
      typing: (name) => `${name} está escribiendo…`,
      placeholder: "Escribe un mensaje corto…",
      send: "Enviar",
      sendError: "No se pudo enviar tu mensaje. Inténtalo de nuevo.",
      closed: "Este match ha expirado por la noche.",
    },
  },
};
