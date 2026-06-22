// Lightweight FR/EN UI dictionary (see docs/decisions.md, 2026-06-19).
// No i18n framework yet: the app is a handful of screens, so a single typed
// dictionary is the cheap insurance that a later switch is a one-file change,
// not a hunt across components. Code stays English; only displayed strings live
// here. The brand name "BarTap" is never localized and stays inline in the UI.
//
// Locale is derived from the venue's city inside a room (Paris -> fr, NYC -> en)
// and from the browser language on the pre-venue pages (landing, profile).

export type Locale = "fr" | "en";

// Cities whose room is shown in French. Extend as venues grow; everything else
// defaults to English.
const FRENCH_CITIES = new Set(["paris"]);

export function localeForCity(city: string | null | undefined): Locale {
  if (city && FRENCH_CITIES.has(city.trim().toLowerCase())) return "fr";
  return "en";
}

// Browser-language fallback for pages reached before a venue is known.
export function browserLocale(): Locale {
  if (
    typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("fr")
  ) {
    return "fr";
  }
  return "en";
}

type Dict = {
  landing: {
    welcome: string;
    tagline: string;
    settingUp: string;
    sessionError: string;
  };
  profile: {
    title: string;
    subtitle: string;
    ageTitle: string;
    ageSubtitle: string;
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
    photoUploadFailed: string;
    genericError: string;
  };
  genders: { woman: string; man: string; nonbinary: string };
  room: {
    entering: string;
    loadError: string;
    venueNotFound: string;
    // takes the venue name
    whosHere: (venue: string) => string;
    pitch: string;
    empty: string;
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
    block: string;
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
    promoTitle: string;
    promoBody: string;
    promoPrimary: string;
    promoSecondary: string;
    promoDismiss: string;
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
    placeholder: string;
    send: string;
    sendError: string;
    closed: string;
  };
};

export const t: Record<Locale, Dict> = {
  en: {
    landing: {
      welcome: "Welcome to",
      tagline: "Scan. Tap. Start your night.",
      settingUp: "Setting up your night…",
      sessionError:
        "Couldn't start your session. Anonymous sign-in may be disabled for this project.",
    },
    profile: {
      title: "Set up your profile",
      subtitle: "A real first name and photo, that's it.",
      ageTitle: "Confirm your age",
      ageSubtitle: "BarTap is for adults only.",
      addPhoto: "Add Photo",
      firstName: "First name",
      bioOptional: "Bio (optional)",
      iAm: "I am",
      iWantToMeet: "I'd like to meet",
      adultConfirm: "I confirm that I am 18 or older.",
      save: "Save profile",
      saving: "Saving…",
      sessionError: "Couldn't start your session. Try again.",
      needFirstName: "Please enter your first name.",
      needPhoto: "Please add a profile picture.",
      needGender: "Please select your gender.",
      needInterest: "Please select who you'd like to meet.",
      needAdult: "Please confirm that you are 18 or older.",
      photoUploadFailed: "Photo upload failed.",
      genericError: "Something went wrong. Try again.",
    },
    genders: { woman: "Woman", man: "Man", nonbinary: "Non-binary" },
    room: {
      entering: "Walking into the room…",
      loadError: "Couldn't load the room. Anonymous sign-in may be disabled.",
      venueNotFound: "This venue doesn't exist.",
      whosHere: (venue) => `Who's at ${venue}`,
      pitch:
        "Like discreetly. A chat only opens if it's mutual. No one ever knows you liked them unless they like you back.",
      empty: "No one to show yet. Check back when the room fills up.",
      like: "Like",
      liked: "Liked",
      likeError: "Couldn't register your like. Try again.",
      leave: "Leave for the night",
      goInvisible: "Go invisible",
      invisibleTitle: "You're invisible",
      invisibleBody:
        "You're not visible in this room, and browsing is paused until you come back.",
      becomeVisible: "Become visible",
      visibilityError: "Couldn't update your visibility. Try again.",
      matchKicker: "It's a match",
      matchBody: "You both tapped. Go say hi, they're here tonight.",
      matchDismiss: "Keep browsing",
      leftTitle: "You've left the room",
      leftBody: "You're no longer visible here. Come back whenever you like.",
      rejoin: "Re-join the room",
      chat: "Chat",
      openChat: "Open chat",
      activeMatches: "Tonight's matches",
      block: "Block",
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
      promoTitle: "You've started",
      promoBody:
        "You just made your first move. Keep BarTap in your pocket for the next one.",
      promoPrimary: "Download on the App Store",
      promoSecondary: "Get it on Google Play",
      promoDismiss: "Not now",
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
      expiresTonight: "Open until the night ends.",
      empty: "No messages yet. Keep it light and go say hi.",
      placeholder: "Write a short message…",
      send: "Send",
      sendError: "Couldn't send your message. Try again.",
      closed: "This match has expired for the night.",
    },
  },
  fr: {
    landing: {
      welcome: "Bienvenue chez",
      tagline: "Scanne. Tape. Commence ta soirée.",
      settingUp: "On prépare ta soirée…",
      sessionError:
        "Impossible de démarrer ta session. La connexion anonyme est peut-être désactivée.",
    },
    profile: {
      title: "Crée ton profil",
      subtitle: "Un vrai prénom et une photo, c'est tout.",
      ageTitle: "Confirme ton âge",
      ageSubtitle: "BarTap est réservé aux adultes.",
      addPhoto: "Ajouter une photo",
      firstName: "Prénom",
      bioOptional: "Bio (optionnel)",
      iAm: "Je suis",
      iWantToMeet: "Je veux rencontrer",
      adultConfirm: "Je confirme avoir 18 ans ou plus.",
      save: "Enregistrer le profil",
      saving: "Enregistrement…",
      sessionError: "Impossible de démarrer ta session. Réessaie.",
      needFirstName: "Entre ton prénom.",
      needPhoto: "Ajoute une photo de profil.",
      needGender: "Choisis ton genre.",
      needInterest: "Choisis qui tu veux rencontrer.",
      needAdult: "Confirme que tu as 18 ans ou plus.",
      photoUploadFailed: "L'envoi de la photo a échoué.",
      genericError: "Un problème est survenu. Réessaie.",
    },
    genders: { woman: "Femme", man: "Homme", nonbinary: "Non-binaire" },
    room: {
      entering: "On entre dans la salle…",
      loadError:
        "Impossible de charger la salle. La connexion anonyme est peut-être désactivée.",
      venueNotFound: "Ce lieu n'existe pas.",
      whosHere: (venue) => `Qui est à ${venue}`,
      pitch:
        "Like en toute discrétion. Un chat ne s'ouvre que si c'est réciproque. Personne ne saura jamais que tu l'as liké tant qu'il ne te like pas en retour.",
      empty: "Personne pour l'instant. Reviens quand la salle se remplit.",
      like: "Like",
      liked: "Liké",
      likeError: "Impossible d'enregistrer ton like. Réessaie.",
      leave: "Quitter la soirée",
      goInvisible: "Passer invisible",
      invisibleTitle: "Tu es invisible",
      invisibleBody:
        "Tu n'apparais plus dans cette salle, et l'exploration est en pause jusqu'à ton retour.",
      becomeVisible: "Redevenir visible",
      visibilityError: "Impossible de changer ta visibilité. Réessaie.",
      matchKicker: "C'est un match",
      matchBody: "Vous vous êtes likés. Va lui dire bonjour, il est là ce soir.",
      matchDismiss: "Continuer à explorer",
      leftTitle: "Tu as quitté la salle",
      leftBody: "Tu n'es plus visible ici. Reviens quand tu veux.",
      rejoin: "Revenir dans la salle",
      chat: "Chat",
      openChat: "Ouvrir le chat",
      activeMatches: "Matches de ce soir",
      block: "Bloquer",
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
      promoTitle: "Tu as commencé",
      promoBody:
        "Tu viens de faire ton premier pas. Garde BarTap dans ta poche pour le suivant.",
      promoPrimary: "Télécharger sur l'App Store",
      promoSecondary: "Disponible sur Google Play",
      promoDismiss: "Plus tard",
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
      expiresTonight: "Ouvert jusqu'à la fin de la soirée.",
      empty: "Aucun message pour l'instant. Reste simple et va lui dire bonjour.",
      placeholder: "Écris un message court…",
      send: "Envoyer",
      sendError: "Impossible d'envoyer ton message. Réessaie.",
      closed: "Ce match a expiré pour la soirée.",
    },
  },
};
