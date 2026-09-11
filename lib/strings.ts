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
    // New-visitor splash (#71): the promise line, the three-beat how-it-works,
    // and the cold-acquisition waitlist (feeds email_subscriptions, #105).
    kicker: string;
    promise: string;
    how: readonly [string, string, string];
    waitlistLabel: string;
    waitlistPlaceholder: string;
    waitlistHelp: string;
    waitlistCta: string;
    waitlistSuccess: string;
    waitlistAlready: string;
    waitlistInvalid: string;
    waitlistError: string;
  };
  profile: {
    title: string;
    subtitle: string;
    // Edit mode (returning user updating an existing profile).
    editTitle: string;
    editSubtitle: string;
    saveChanges: string;
    back: string;
    // Section heading for the identity group in the editor (photo, name, bio,
    // gender). The preference group reuses `iWantToMeet`.
    youSection: string;
    // Unsaved-changes guard when leaving the editor with pending edits.
    discardTitle: string;
    discardBody: string;
    discardConfirm: string;
    discardKeep: string;
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
    firstNameTooLong: string;
    bioTooLong: string;
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
    // Guided onboarding wizard (#72). The flow asks one question per screen and
    // ends on an editable preview of the room card; edit mode reuses the same
    // field widgets on a single screen.
    onb: {
      stepOf: (n: number, total: number) => string;
      namePrompt: string;
      nameHelp: string;
      photoPrompt: string;
      photoHelp: string;
      genderPrompt: string;
      interestPrompt: string;
      interestHelp: string;
      bioPrompt: string;
      bioHelp: string;
      previewKicker: string;
      changePhoto: string;
      continue: string;
      reassure: string;
      resumeNote: string;
    };
  };
  genders: { woman: string; man: string; nonbinary: string };
  room: {
    // Entry threshold (#103): the loading state as a designed doorway. Kicker
    // above the venue name, the tag beside the live-dot, and the discreet-like
    // reassurance (the north star: no public rejection, ever).
    enterKicker: string;
    enterLiveTag: string;
    enterReassure: string;
    // Generic technical failure (anonymous sign-in off, etc.); loadError is the
    // body under this title.
    errorTitle: string;
    loadError: string;
    // The slug matches no venue: notFoundTitle over venueNotFound (the body).
    notFoundTitle: string;
    venueNotFound: string;
    // No venue night currently accepts participants.
    closedTitle: string;
    closedBody: string;
    pausedTitle: string;
    pausedBody: string;
    cancelledTitle: string;
    cancelledBody: string;
    endedTitle: string;
    endedBody: string;
    backHome: string;
    preLaunch: {
      title: string;
      body: string;
      deadline: (time: string) => string;
      earlier: string;
      count: (count: number) => string;
      emailPlaceholder: string;
      emailConsent: string;
      emailConsentRequired: string;
      emailSubmit: string;
      emailSaving: string;
      emailNotNow: string;
      emailConfirmed: string;
      emailInvalid: string;
      emailError: string;
    };
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
    // Empty live-room state: the room is live but no compatible profile yet. The
    // count itself is rendered as a big numeral; this is the label under it.
    roomCount: (count: number) => string;
    // Compact live status in the room chrome header (red dot + this), e.g.
    // "23 here now" — shorter than roomCount's sentence.
    liveStatus: (count: number) => string;
    // Collapsed matches pill label, e.g. "2 matches".
    matchesCount: (count: number) => string;
    // Empty live-room state (#118), separate from the pre-launch waiting room.
    // The live count is not repeated here — the persistent room chrome shows it.
    //
    // Three variants, never more: what the participant can act on is identical
    // in all of them, so the only thing that changes is how honest the framing
    // is about what is happening in the room.
    //   alone   — you are the only one checked in (roomCount <= 1).
    //   emptied — same, but the room had people earlier this session.
    //   live    — people are here, your feed is empty. Never say why: block,
    //             preference, and visibility are indistinguishable client-side
    //             (RLS strips them alike), and explaining would announce a
    //             rejection. "for you" is the honest hedge.
    empty: {
      aloneTitle: string;
      aloneBody: string;
      emptiedTitle: string;
      emptiedBody: string;
      liveTitle: string;
      liveBody: string;
      kicker: string;
      // Transient notice when the feed drains under the participant. True
      // whether they left, blocked, or matched — and it never says which.
      feedDrained: string;
      // Someone arrived while an answer was being typed here, so the feed was
      // held back. The way out of the held screen, hence a full card.
      heldArrival: string;
    };
    // The bio is the only real "improve your odds" lever (no second photo).
    // Shared by the empty live room and the pre-launch waiting room (#147) so
    // the two screens never drift apart.
    bio: {
      emptyTitle: string;
      emptyBody: string;
      emptyBadge: string;
      fullTitle: string;
      fullBody: string;
    };
    // The next-nights email opt-in, worded once for both screens that offer it
    // (the empty live room and the pre-launch waiting room). They share the card
    // component, so they share its words: two titles for one ask is the drift
    // RoomCards.tsx exists to prevent. The consent sentence is separate and
    // lives in preLaunch, since it is the audited text.
    emailCard: {
      title: string;
      body: string;
    };
    like: string;
    liked: string;
    removeLike: (name: string) => string;
    likeError: string;
    unlikeError: string;
    leave: string;
    leaveError: string;
    leaveConfirmTitle: string;
    leaveConfirmBody: string;
    leavePreserved: string;
    leaveStay: string;
    leaveVenue: (venue: string) => string;
    leaving: string;
    goInvisible: string;
    invisibleTitle: string;
    invisibleBody: string;
    becomeVisible: string;
    visibilityError: string;
    matchKicker: string;
    matchTitle: string;
    matchBody: string;
    matchDismiss: string;
    leftTitle: string;
    leftBody: string;
    departedTitle: string;
    departedBody: string;
    rejoin: string;
    rejoinVenue: (venue: string) => string;
    chat: string;
    openChat: string;
    activeMatches: string;
    conversationHint: string;
    openConversation: (name: string) => string;
    block: string;
    blockTitle: (name: string) => string;
    blockBody: string;
    blockReasonOptional: string;
    blockReason: string;
    blockSubmit: string;
    // Native confirm still used by the chat block flow (out of the room-popup
    // redesign scope). The room block popup uses blockBody in-modal instead.
    blockConfirm: (name: string) => string;
    blockError: string;
    report: string;
    reportTitle: (name: string) => string;
    reportReason: string;
    reportNote: string;
    reportNoteRequired: string;
    reportNoteRequiredError: string;
    reportSubmit: string;
    reportCancel: string;
    reportClose: string;
    reportSuccess: string;
    reportError: string;
    reportEligibilityError: string;
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
    send: string;
    sendError: string;
    deliverySending: string;
    deliveryFailed: string;
    deliveryRetry: string;
    deliveryRetrying: string;
    deliveryRecovered: string;
    scrollToLatest: string;
    newMessages: (count: number) => string;
    closed: string;
    presence: string;
    departed: string;
    messagingPaused: string;
    openerTitle: string;
    openerNote: string;
    suggestions: readonly string[];
    viewProfile: (name: string) => string;
    closeProfile: string;
    backToConversation: string;
  };
};

// Convenience aliases so components can type their string props without the
// whole Dict (which stays internal).
export type ProfileStrings = Dict["profile"];
export type GenderLabels = Dict["genders"];

export const t: Record<Locale, Dict> = {
  en: {
    landing: {
      welcome: "Inside the room",
      tagline: "Scan. Tap. Start your night.",
      settingUp: "Opening the room…",
      sessionError:
        "Couldn’t load Amourette. Refresh the page to try again.",
      welcomeBack: "Good to see you again",
      newVisitorLead: "Scan the QR at the bar to join the night.",
      returningLead: "Scan the bar’s QR to join tonight.",
      yourProfile: "Your profile",
      editProfile: "Edit my profile",
      kicker: "Making the first move easier.",
      promise: "Someone at the bar caught your eye? If the feeling's mutual, a first message to break the ice, then a hello in person.",
      how: ["Scan the QR at the bar.", "A heart to like someone in secret.", "A match to start a conversation."],
      waitlistLabel: "Want to join an Amourette night?",
      waitlistPlaceholder: "you@email.com",
      waitlistHelp: "Leave your email to hear about upcoming nights. You can unsubscribe anytime.",
      waitlistCta: "Keep me posted",
      waitlistSuccess: "All set. We’ll let you know about upcoming nights.",
      waitlistAlready: "You’re already on the list. We’ll keep you posted.",
      waitlistInvalid: "Enter a valid email address.",
      waitlistError: "Couldn’t save your email. Try again in a moment.",
    },
    profile: {
      title: "Your profile is your vibe",
      subtitle: "A real first name, a clear photo, and the energy you bring.",
      editTitle: "Edit my profile",
      editSubtitle: "A new photo, a few more words?",
      saveChanges: "Save changes",
      back: "Back",
      youSection: "You",
      discardTitle: "Discard changes?",
      discardBody: "Your changes won’t be saved.",
      discardConfirm: "Discard changes",
      discardKeep: "Keep editing",
      tonightAt: (venue) => `Tonight at ${venue}`,
      ageTitle: "Confirm your age",
      ageSubtitle: "Amourette is for people aged 18 and over.",
      trustPills: ["Discreet taps", "Mutual only", "You stay in control"],
      addPhoto: "Add Photo",
      firstName: "First name",
      bioOptional: "Bio (optional)",
      iAm: "I am",
      iWantToMeet: "I’d like to meet",
      adultConfirm: "I confirm that I am 18 or older.",
      save: "Join tonight",
      saving: "Saving…",
      sessionError: "Couldn’t start your session. Refresh the page to try again.",
      needFirstName: "Enter your first name.",
      firstNameTooLong: "Your first name can be up to 30 characters long.",
      bioTooLong: "Your bio can be up to 500 characters long.",
      needPhoto: "Add a profile photo.",
      needGender: "Choose your gender.",
      needInterest: "Choose who you’d like to meet.",
      needAdult: "Confirm that you’re 18 or older.",
      photoInvalidType: "Choose a photo in JPG, PNG or WebP format.",
      photoTooLarge: "Choose a photo no larger than 5 MB.",
      photoRejected:
        "Please use a clear real photo of your face. No blank images, memes, screenshots, group photos, or hidden faces.",
      photoReviewFailed: "Couldn't check your photo. Try again.",
      photoUploadFailed: "Couldn’t upload your photo. Try again.",
      genericError: "Something went wrong. Try again.",
      onb: {
        stepOf: (n, total) => `Step ${n} of ${total}`,
        namePrompt: "What should we call you?",
        nameHelp: "The first name people know you by.",
        photoPrompt: "Help people recognize you",
        photoHelp: "Choose a photo that clearly shows your face.",
        genderPrompt: "You are…",
        interestPrompt: "You’d like to meet…",
        interestHelp: "Pick one or more options.",
        bioPrompt: "A few words about you",
        bioHelp: "Optional: a passion, what makes you laugh, or what brings you here tonight.",
        previewKicker: "Your profile for tonight",
        changePhoto: "Change photo",
        continue: "Continue",
        reassure: "Your likes stay private unless the feeling is mutual.",
        resumeNote: "We kept what you'd started.",
      },
    },
    genders: { woman: "Woman", man: "Man", nonbinary: "Non-binary" },
    room: {
      enterKicker: "Welcome",
      enterLiveTag: "Night in progress",
      enterReassure:
        "Your likes stay private unless the feeling is mutual.",
      errorTitle: "Couldn’t load this page",
      loadError: "Refresh the page to try again.",
      notFoundTitle: "This link doesn’t match any bar",
      venueNotFound: "Scan the QR displayed at the bar to join its Amourette night.",
      closedTitle: "No night to join right now",
      closedBody:
        "Scan the bar’s QR during an Amourette night to join.",
      pausedTitle: "The night is paused",
      pausedBody:
        "Access to this night is temporarily suspended. This page will update if the night resumes.",
      cancelledTitle: "The night is cancelled",
      cancelledBody:
        "You’re no longer checked in for this Amourette night.",
      endedTitle: "The night has ended",
      endedBody: "Likes, matches and conversations from this night are no longer available. Your profile is still saved.",
      backHome: "Back to home",
      preLaunch: {
          title: "Getting ready to start.",
        body: "You’re in. Once the night starts, you can see who’s here and send likes.",
        deadline: (time) => `Starting by ${time} at the latest`,
        earlier: "It may start earlier if enough people have joined.",
        count: (count) => `${count} ${count === 1 ? "person" : "people"} waiting`,
        emailPlaceholder: "you@email.com",
        emailConsent: "I agree to receive email announcements about upcoming Amourette nights. I can unsubscribe at any time.",
        emailConsentRequired: "Please confirm that you agree to receive these emails.",
        emailSubmit: "Keep me posted",
        emailSaving: "Saving…",
        emailNotNow: "Not now",
        emailConfirmed: "We’ll let you know about upcoming nights.",
        emailInvalid: "That email doesn't look right.",
        emailError: "Couldn't save your email. Try again.",
      },
      justArrived: "Just joined",
      newArrivalCue: "A new profile to discover ↓",
      profileActions: "More actions",
      roomActions: "Night options",
      editProfile: "Edit my profile",
      firstTimeHintTitle: "Someone caught your eye?",
      firstTimeHintBody:
        "Tap the heart to like someone. If the feeling’s mutual, you match and a conversation opens. Otherwise, your like stays private.",
      firstTimeHintDismiss: "Got it",
      emailPromptTitle: "Want to hear about upcoming nights?",
      emailPromptBody:
        "Leave your email to hear when the next nights are happening.",
      emailPromptPlaceholder: "you@example.com",
      emailPromptConsent:
        "I agree to receive announcements about upcoming Amourette nights by email. I can unsubscribe at any time.",
      emailPromptSubmit: "Keep me posted",
      emailPromptSaving: "Saving…",
      emailPromptNotNow: "Not now",
      emailPromptClose: "Close email signup",
      emailPromptSuccess: "We’ll let you know about upcoming nights.",
      emailPromptError: "Couldn't save your email. Try again.",
      roomCount: (count) =>
        count === 1
          ? "person in the room right now (that's you)"
          : "people in the room right now, counting you",
      liveStatus: (count) => `${count} here now`,
      matchesCount: (count) => `${count} ${count === 1 ? "match" : "matches"}`,
      empty: {
        aloneTitle: "It’s quiet on Amourette.",
        aloneBody:
          "No one else is on Amourette at this bar right now.",
        emptiedTitle: "It’s quieter on Amourette.",
        emptiedBody:
          "For now, there’s no one else on Amourette here.",
        liveTitle: "No profiles available right now.",
        liveBody:
          "New profiles may appear as the night goes on.",
        kicker: "Meanwhile",
        feedDrained: "No more profiles to show right now.",
        heldArrival: "A new profile is available. Take a look",
      },
      bio: {
        emptyTitle: "A few words to break the ice",
        emptyBody:
          "A passion or a story can help start a conversation.",
        emptyBadge: "Optional",
        fullTitle: "Want to add a detail?",
        fullBody: "Edit your bio to share a little more about yourself.",
      },
      emailCard: {
        title: "Want to hear about upcoming nights?",
        body: "Leave your email to hear when the next nights are happening.",
      },
      like: "Like",
      liked: "Like",
      removeLike: (name) => `Unlike ${name}`,
      likeError: "Your like couldn’t be saved. Try again.",
      unlikeError: "Your like couldn’t be removed. Try again.",
      leave: "Leave",
      leaveError: "Couldn’t leave. Try again.",
      leaveConfirmTitle: "Leave?",
      leaveConfirmBody:
        "Your profile will no longer appear in discovery, and you’ll no longer count as here. Messaging will be paused.",
      leavePreserved:
        "Your likes, matches and conversations are kept until the night ends.",
      leaveStay: "Stay",
      leaveVenue: (venue) => `Leave ${venue}`,
      leaving: "Leaving…",
      goInvisible: "Hide my profile",
      invisibleTitle: "Your profile is hidden",
      invisibleBody:
        "Your profile is no longer shown in discovery, and you can’t browse other profiles. You’re still checked in, and your conversations remain available.",
      becomeVisible: "Make my profile visible",
      visibilityError: "Couldn’t change your profile’s visibility. Try again.",
      matchKicker: "A match",
      matchTitle: "The feeling’s mutual.",
      matchBody:
        "A first message to meet up?",
      matchDismiss: "Back to tonight",
      leftTitle: "Back at the bar?",
      leftBody:
        "Join again to check back in. Your conversations can resume if you’re both here before the night ends.",
      departedTitle: "You’ve left",
      departedBody:
        "You’re no longer checked in, and messaging is paused. Your likes, matches and conversations are kept until the night ends.",
      rejoin: "Join tonight",
      rejoinVenue: (venue) => `Join ${venue} tonight`,
      chat: "Open",
      openChat: "Write a message",
      activeMatches: "Conversations",
      conversationHint: "Find your conversations here after a match.",
      openConversation: (name) => `Open conversation with ${name}`,
      block: "Block",
      blockTitle: (name) => `Block ${name}?`,
      blockBody:
        "Your profiles will no longer be visible to each other on Amourette, and your conversations will be closed. This person won’t receive a notification.",
      blockReasonOptional: "Add a reason (optional)",
      blockReason: "Reason for blocking",
      blockSubmit: "Block this person",
      blockConfirm: (name) => `Block ${name}? Your profiles will no longer be visible to each other on Amourette, and your conversations will be closed. This person won’t receive a notification.`,
      blockError: "Couldn’t block this person. Try again.",
      report: "Report",
      reportTitle: (name) => `Report ${name}`,
      reportReason: "Reason for reporting",
      reportNote: "Add details (optional)",
      reportNoteRequired: "Explain what happened (required)",
      reportNoteRequiredError: "For “Other”, explain what happened.",
      reportSubmit: "Send report",
      reportCancel: "Cancel",
      reportClose: "Close",
      reportSuccess: "Your report has been sent.",
      reportError: "Couldn’t send your report. Try again.",
      reportEligibilityError: "You can only report someone who joined the same night as you.",
      reportBlockPrompt: "Would you also like to block this person?",
      reportReasons: {
        harassment: "Harassment",
        fake_profile: "Fake profile",
        underage: "Underage person",
        unsafe_behavior: "Unsafe behavior",
        other: "Other",
      },
    },
    chat: {
      loading: "Opening the conversation…",
      unavailable: "Couldn’t open this conversation.",
      backToRoom: "Back to tonight",
      expiresTonight: "Open for tonight.",
      empty: "No messages yet. Feel like making the first move?",
      typing: (name) => `${name} is typing…`,
      send: "Send",
      sendError: "Couldn't send your message. Try again.",
      deliverySending: "Sending…",
      deliveryFailed: "Not sent",
      deliveryRetry: "Try again",
      deliveryRetrying: "Trying again…",
      deliveryRecovered: "Message recovered and sent.",
      scrollToLatest: "Go to the latest message",
      newMessages: (count) =>
        count === 1 ? "1 new message" : `${count} new messages`,
      closed: "This conversation is no longer available.",
      presence: "Here now",
      departed: "Has left",
      messagingPaused:
        "Messaging is paused. You can resume if you’re both back here before the night ends.",
      openerTitle: "The feeling’s mutual.",
      openerNote: "This conversation is available until the night ends.",
      suggestions: ["Where are you in the bar?","Want to meet by the bar?","Shall I come say hi?"],
      viewProfile: (name) => `View ${name}'s profile`,
      closeProfile: "Close profile",
      backToConversation: "Back to the conversation",
    },
  },
  fr: {
    landing: {
      welcome: "Dans la salle",
      tagline: "Scanne. Craque. Commence ta soirée.",
      settingUp: "On ouvre la salle…",
      sessionError:
        "Impossible de charger Amourette. Actualise la page pour réessayer.",
      welcomeBack: "Content de te revoir",
      newVisitorLead: "Scanne le QR à l'entrée du bar pour rejoindre la soirée.",
      returningLead: "Scanne le QR du bar pour rejoindre la soirée.",
      yourProfile: "Ton profil",
      editProfile: "Modifier mon profil",
      kicker: "Pour oser le premier pas.",
      promise: "Quelqu'un te plaît dans le bar ? Si c'est réciproque, un premier message pour briser la glace, puis un bonjour en vrai.",
      how: ["Scanne le QR au bar.", "Un cœur pour dire « J’aime », en secret.", "Un match pour commencer à discuter."],
      waitlistLabel: "Envie de venir à une soirée Amourette ?",
      waitlistPlaceholder: "toi@email.com",
      waitlistHelp: "Laisse ton email pour connaître les prochaines soirées. Tu peux te désinscrire à tout moment.",
      waitlistCta: "Me prévenir",
      waitlistSuccess: "C’est noté. On te prévient des prochaines soirées.",
      waitlistAlready: "Tu es déjà sur la liste. On te tient au courant.",
      waitlistInvalid: "Entre une adresse email valide.",
      waitlistError: "Impossible d’enregistrer ton email. Réessaie dans un instant.",
    },
    profile: {
      title: "Ton profil, ton énergie",
      subtitle: "Un vrai prénom, une photo claire, et l'énergie que tu amènes.",
      editTitle: "Modifier mon profil",
      editSubtitle: "Une nouvelle photo, quelques mots en plus ?",
      saveChanges: "Enregistrer les modifications",
      back: "Retour",
      youSection: "Toi",
      discardTitle: "Abandonner les modifications ?",
      discardBody: "Tes modifications ne seront pas enregistrées.",
      discardConfirm: "Abandonner les modifications",
      discardKeep: "Continuer à modifier",
      tonightAt: (venue) => `Ce soir à ${venue}`,
      ageTitle: "Confirme ton âge",
      ageSubtitle: "Amourette est réservé aux personnes de 18 ans et plus.",
      trustPills: [
        "Coups de cœur discrets",
        "Mutuel seulement",
        "Tu gardes le contrôle",
      ],
      addPhoto: "Ajouter une photo",
      firstName: "Prénom",
      bioOptional: "Bio (facultative)",
      iAm: "Je suis",
      iWantToMeet: "J’aimerais rencontrer",
      adultConfirm: "Je confirme avoir 18 ans ou plus.",
      save: "Rejoindre la soirée",
      saving: "Enregistrement…",
      sessionError: "Impossible de démarrer ta session. Actualise la page pour réessayer.",
      needFirstName: "Entre ton prénom.",
      firstNameTooLong: "Ton prénom peut contenir jusqu’à 30 caractères.",
      bioTooLong: "Ta bio peut contenir jusqu’à 500 caractères.",
      needPhoto: "Ajoute une photo de profil.",
      needGender: "Choisis ton genre.",
      needInterest: "Choisis qui tu veux rencontrer.",
      needAdult: "Confirme que tu as 18 ans ou plus.",
      photoInvalidType: "Choisis une photo au format JPG, PNG ou WebP.",
      photoTooLarge: "Choisis une photo de 5 Mo maximum.",
      photoRejected:
        "Utilise une vraie photo claire de ton visage. Pas d'image vide, meme, capture d'écran, photo de groupe ou visage caché.",
      photoReviewFailed: "Impossible de vérifier ta photo. Réessaie.",
      photoUploadFailed: "Impossible d’envoyer ta photo. Réessaie.",
      genericError: "Un problème est survenu. Réessaie.",
      onb: {
        stepOf: (n, total) => `Étape ${n} sur ${total}`,
        namePrompt: "On t’appelle comment ?",
        nameHelp: "Le prénom par lequel on te connaît.",
        photoPrompt: "Une photo pour te reconnaître",
        photoHelp: "Choisis une photo où l’on voit clairement ton visage.",
        genderPrompt: "Tu es…",
        interestPrompt: "Tu aimerais rencontrer…",
        interestHelp: "Choisis une ou plusieurs options.",
        bioPrompt: "Deux mots sur toi",
        bioHelp: "Facultatif : une passion, ce qui te fait rire, ou ce qui t’amène ce soir.",
        previewKicker: "Ton profil pour la soirée",
        changePhoto: "Changer de photo",
        continue: "Continuer",
        reassure: "Tes J’aime restent secrets, sauf si c’est réciproque.",
        resumeNote: "On a gardé ce que tu avais commencé.",
      },
    },
    genders: { woman: "Femme", man: "Homme", nonbinary: "Non-binaire" },
    room: {
      enterKicker: "Bienvenue à la soirée",
      enterLiveTag: "Soirée en cours",
      enterReassure:
        "Tes J’aime restent secrets, sauf si c’est réciproque.",
      errorTitle: "Impossible de charger la soirée",
      loadError: "Actualise la page pour réessayer.",
      notFoundTitle: "Ce lien ne correspond à aucun bar",
      venueNotFound:
        "Scanne le QR affiché dans le bar pour rejoindre sa soirée Amourette.",
      closedTitle: "Pas de soirée ouverte pour le moment",
      closedBody:
        "Scanne le QR du bar lors d’une soirée Amourette pour la rejoindre.",
      pausedTitle: "La soirée est en pause",
      pausedBody:
        "L’accès à cette soirée est temporairement suspendu. Cette page se mettra à jour si elle reprend.",
      cancelledTitle: "La soirée est annulée",
      cancelledBody:
        "Tu n’es plus compté·e sur place pour cette soirée Amourette.",
      endedTitle: "La soirée est terminée",
      endedBody: "Les J’aime, matchs et conversations de cette soirée ne sont plus disponibles. Ton profil reste enregistré.",
      backHome: "Retour à l’accueil",
      preLaunch: {
          title: "La soirée se prépare.",
        body: "Tu as bien rejoint la soirée. Tu pourras découvrir qui est là et envoyer des J’aime dès son lancement.",
        deadline: (time) => `Début au plus tard à ${time}`,
        earlier: "Elle peut commencer plus tôt si assez de personnes ont rejoint la soirée.",
        count: (count) => `${count} personne${count > 1 ? "s" : ""} en attente`,
        emailPlaceholder: "toi@exemple.com",
        emailConsent: "J’accepte de recevoir par email les annonces des prochaines soirées Amourette. Je pourrai me désinscrire à tout moment.",
        emailConsentRequired: "Confirme que tu acceptes de recevoir ces emails.",
        emailSubmit: "Me prévenir",
        emailSaving: "Enregistrement…",
        emailNotNow: "Pas maintenant",
        emailConfirmed: "On te prévient des prochaines soirées.",
        emailInvalid: "Cette adresse email ne semble pas valide.",
        emailError: "Impossible d’enregistrer ton email. Réessaie.",
      },
      justArrived: "Vient de rejoindre la soirée",
      newArrivalCue: "Un nouveau profil à découvrir ↓",
      profileActions: "Plus d'actions",
      roomActions: "Options de la soirée",
      editProfile: "Modifier mon profil",
      firstTimeHintTitle: "Quelqu’un te plaît ?",
      firstTimeHintBody:
        "Appuie sur le cœur pour dire « J’aime ». Si c’est réciproque, vous avez un match et une conversation s’ouvre. Sinon, ton J’aime reste secret.",
      firstTimeHintDismiss: "Compris",
      emailPromptTitle: "On te prévient des prochaines soirées ?",
      emailPromptBody:
        "Laisse ton email pour recevoir les prochaines dates.",
      emailPromptPlaceholder: "toi@exemple.com",
      emailPromptConsent:
        "J'accepte de recevoir par email les annonces des prochaines soirées Amourette. Je pourrai me désinscrire à tout moment.",
      emailPromptSubmit: "Me prévenir",
      emailPromptSaving: "Enregistrement…",
      emailPromptNotNow: "Pas maintenant",
      emailPromptClose: "Fermer l'inscription par email",
      emailPromptSuccess: "On te prévient des prochaines soirées.",
      emailPromptError: "Impossible d'enregistrer ton email. Réessaie.",
      roomCount: (count) =>
        count > 1
          ? "personnes dans la salle en ce moment, en te comptant"
          : "personne dans la salle en ce moment (c'est toi)",
      liveStatus: (count) => `${count} sur place`,
      matchesCount: (count) => `${count} match${count === 1 ? "" : "s"}`,
      empty: {
        aloneTitle: "C’est calme sur Amourette.",
        aloneBody:
          "Il n’y a personne d’autre sur Amourette dans ce bar pour le moment.",
        emptiedTitle: "C’est plus calme sur Amourette.",
        emptiedBody:
          "Il n’y a plus d’autre personne sur Amourette ici pour le moment.",
        liveTitle: "Personne à découvrir pour le moment.",
        liveBody:
          "De nouveaux profils peuvent apparaître au fil de la soirée.",
        kicker: "En attendant",
        feedDrained: "Il n’y a plus de profil à afficher pour le moment.",
        heldArrival: "Un nouveau profil est disponible. Découvrir",
      },
      bio: {
        emptyTitle: "Deux mots pour faire connaissance",
        emptyBody:
          "Une passion ou une anecdote peut aider à lancer la conversation.",
        emptyBadge: "Facultatif",
        fullTitle: "Envie d’ajouter un détail ?",
        fullBody: "Modifie ta bio pour en dire un peu plus sur toi.",
      },
      emailCard: {
        title: "On te prévient des prochaines soirées ?",
        body: "Laisse ton email pour recevoir les prochaines dates.",
      },
      like: "J’aime",
      liked: "J’aime",
      removeLike: (name) => `Retirer mon J’aime pour ${name}`,
      likeError: "Ton J’aime n’a pas pu être enregistré. Réessaie.",
      unlikeError: "Ton J’aime n’a pas pu être retiré. Réessaie.",
      leave: "Quitter la soirée",
      leaveError: "Impossible de quitter la soirée. Réessaie.",
      leaveConfirmTitle: "Quitter la soirée ?",
      leaveConfirmBody:
        "Ton profil ne sera plus proposé et tu ne seras plus compté·e sur place. L’envoi de messages sera mis en pause.",
      leavePreserved:
        "Tes J’aime, matchs et conversations sont conservés jusqu’à la fin de la soirée.",
      leaveStay: "Rester",
      leaveVenue: (venue) => `Quitter ${venue}`,
      leaving: "Départ…",
      goInvisible: "Masquer mon profil",
      invisibleTitle: "Ton profil est masqué",
      invisibleBody:
        "Ton profil n’est plus proposé aux autres, et tu ne peux plus parcourir les profils. Tu restes compté·e sur place et tes conversations restent accessibles.",
      becomeVisible: "Rendre mon profil visible",
      visibilityError: "Impossible de modifier la visibilité de ton profil. Réessaie.",
      matchKicker: "Un match",
      matchTitle: "C’est réciproque.",
      matchBody:
        "Un premier message pour vous retrouver ?",
      matchDismiss: "Retour à la soirée",
      leftTitle: "De retour sur place ?",
      leftBody:
        "Rejoins la soirée pour être à nouveau compté·e sur place. Tes conversations pourront reprendre si vous êtes tous les deux présents avant la fin de la soirée.",
      departedTitle: "Tu as quitté la soirée",
      departedBody:
        "Tu n’es plus compté·e sur place et l’envoi de messages est en pause. Tes J’aime, matchs et conversations sont conservés jusqu’à la fin de la soirée.",
      rejoin: "Rejoindre la soirée",
      rejoinVenue: (venue) => `Rejoindre ${venue} ce soir`,
      chat: "Ouvrir",
      openChat: "Écrire un message",
      activeMatches: "Conversations",
      conversationHint:
        "Retrouve ici tes conversations après un match.",
      openConversation: (name) => `Ouvrir la conversation avec ${name}`,
      block: "Bloquer",
      blockTitle: (name) => `Bloquer ${name} ?`,
      blockBody:
        "Vos profils ne seront plus visibles l’un pour l’autre sur Amourette et vos conversations seront fermées. Cette personne ne recevra aucune notification.",
      blockReasonOptional: "Ajouter un motif (facultatif)",
      blockReason: "Motif du blocage",
      blockSubmit: "Bloquer cette personne",
      blockConfirm: (name) => `Bloquer ${name} ? Vos profils ne seront plus visibles l’un pour l’autre sur Amourette et vos conversations seront fermées. Cette personne ne recevra aucune notification.`,
      blockError: "Impossible de bloquer cette personne. Réessaie.",
      report: "Signaler",
      reportTitle: (name) => `Signaler ${name}`,
      reportReason: "Motif du signalement",
      reportNote: "Ajouter des précisions (facultatif)",
      reportNoteRequired: "Explique ce qui s’est passé (obligatoire)",
      reportNoteRequiredError: "Pour le motif « Autre », explique ce qui s’est passé.",
      reportSubmit: "Envoyer le signalement",
      reportCancel: "Annuler",
      reportClose: "Fermer",
      reportSuccess: "Ton signalement a été envoyé.",
      reportError: "Impossible d’envoyer ton signalement. Réessaie.",
      reportEligibilityError: "Tu peux uniquement signaler une personne qui a rejoint la même soirée que toi.",
      reportBlockPrompt: "Souhaites-tu aussi bloquer cette personne ?",
      reportReasons: {
        harassment: "Harcèlement",
        fake_profile: "Faux profil",
        underage: "Personne mineure",
        unsafe_behavior: "Comportement dangereux",
        other: "Autre",
      },
    },
    chat: {
      loading: "Ouverture de la conversation…",
      unavailable: "Impossible d’ouvrir cette conversation.",
      backToRoom: "Retour à la soirée",
      expiresTonight: "Ouvert pour ce soir.",
      empty: "Aucun message pour l’instant. Envie de faire le premier pas ?",
      typing: (name) => `${name} écrit…`,
      send: "Envoyer",
      sendError: "Impossible d'envoyer ton message. Réessaie.",
      deliverySending: "Envoi…",
      deliveryFailed: "Non envoyé",
      deliveryRetry: "Réessayer",
      deliveryRetrying: "Nouvel essai…",
      deliveryRecovered: "Message récupéré et envoyé.",
      scrollToLatest: "Aller au dernier message",
      newMessages: (count) =>
        count === 1 ? "1 nouveau message" : `${count} nouveaux messages`,
      closed: "Cette conversation n’est plus disponible.",
      presence: "Sur place",
      departed: "A quitté la soirée",
      messagingPaused:
        "L’envoi de messages est en pause. Vous pourrez reprendre si vous êtes à nouveau tous les deux sur place avant la fin de la soirée.",
      openerTitle: "C’est réciproque.",
      openerNote: "Cette conversation est disponible jusqu’à la fin de la soirée.",
      suggestions: ["Tu es où dans le bar ?","On se retrouve près du bar ?","Je viens te dire bonjour ?"],
      viewProfile: (name) => `Voir le profil de ${name}`,
      closeProfile: "Fermer le profil",
      backToConversation: "Retour à la conversation",
    },
  },
  es: {
    landing: {
      welcome: "Dentro de la sala",
      tagline: "Escanea. Flecha. Empieza tu noche.",
      settingUp: "Abriendo la sala…",
      sessionError:
        "No se ha podido cargar Amourette. Actualiza la página para intentarlo de nuevo.",
      welcomeBack: "Qué bueno verte de nuevo",
      newVisitorLead: "Escanea el QR en la entrada del bar para unirte a la noche.",
      returningLead: "Escanea el QR del bar para unirte a la noche.",
      yourProfile: "Tu perfil",
      editProfile: "Editar mi perfil",
      kicker: "Para atreverte a dar el primer paso.",
      promise: "¿Te gusta alguien del bar? Si es mutuo, un primer mensaje para romper el hielo y luego un saludo en persona.",
      how: ["Escanea el QR del bar.", "Un corazón para decir «Me gusta», en secreto.", "Un match para empezar a hablar."],
      waitlistLabel: "¿Quieres venir a una noche de Amourette?",
      waitlistPlaceholder: "tu@email.com",
      waitlistHelp: "Deja tu email para enterarte de las próximas noches. Puedes darte de baja cuando quieras.",
      waitlistCta: "Avísame",
      waitlistSuccess: "Listo. Te avisaremos de las próximas noches.",
      waitlistAlready: "Ya estás en la lista. Te mantendremos al tanto.",
      waitlistInvalid: "Introduce una dirección de email válida.",
      waitlistError: "No hemos podido guardar tu email. Inténtalo de nuevo en un momento.",
    },
    profile: {
      title: "Tu perfil es tu vibra",
      subtitle: "Un nombre real, una foto clara y la energía que traes.",
      editTitle: "Editar mi perfil",
      editSubtitle: "¿Una foto nueva, unas palabras más?",
      saveChanges: "Guardar cambios",
      back: "Volver",
      youSection: "Tú",
      discardTitle: "¿Descartar los cambios?",
      discardBody: "Tus cambios no se guardarán.",
      discardConfirm: "Descartar los cambios",
      discardKeep: "Seguir editando",
      tonightAt: (venue) => `Esta noche en ${venue}`,
      ageTitle: "Confirma tu edad",
      ageSubtitle: "Amourette es para personas de 18 años o más.",
      trustPills: ["Flechazos discretos", "Solo mutuo", "Tú tienes el control"],
      addPhoto: "Añadir foto",
      firstName: "Nombre",
      bioOptional: "Bio (opcional)",
      iAm: "Soy",
      iWantToMeet: "Me gustaría conocer",
      adultConfirm: "Confirmo que tengo 18 años o más.",
      save: "Unirme a la noche",
      saving: "Guardando…",
      sessionError: "No se ha podido iniciar tu sesión. Actualiza la página para intentarlo de nuevo.",
      needFirstName: "Introduce tu nombre.",
      firstNameTooLong: "Tu nombre puede tener hasta 30 caracteres.",
      bioTooLong: "Tu bio puede tener hasta 500 caracteres.",
      needPhoto: "Añade una foto de perfil.",
      needGender: "Elige tu género.",
      needInterest: "Elige a quién te gustaría conocer.",
      needAdult: "Confirma que tienes 18 años o más.",
      photoInvalidType: "Elige una foto en formato JPG, PNG o WebP.",
      photoTooLarge: "Elige una foto de 5 MB como máximo.",
      photoRejected:
        "Usa una foto real y clara de tu cara. Sin imágenes vacías, memes, capturas, fotos de grupo ni caras ocultas.",
      photoReviewFailed: "No se pudo revisar tu foto. Inténtalo de nuevo.",
      photoUploadFailed: "No se ha podido subir tu foto. Inténtalo de nuevo.",
      genericError: "Algo salió mal. Inténtalo de nuevo.",
      onb: {
        stepOf: (n, total) => `Paso ${n} de ${total}`,
        namePrompt: "¿Cómo te llamamos?",
        nameHelp: "El nombre por el que te conocen.",
        photoPrompt: "Una foto para reconocerte",
        photoHelp: "Elige una foto en la que se vea claramente tu cara.",
        genderPrompt: "Eres…",
        interestPrompt: "Te gustaría conocer…",
        interestHelp: "Elige una o varias opciones.",
        bioPrompt: "Unas palabras sobre ti",
        bioHelp: "Opcional: algo que te apasiona, lo que te hace reír o lo que te trae aquí esta noche.",
        previewKicker: "Tu perfil para esta noche",
        changePhoto: "Cambiar foto",
        continue: "Continuar",
        reassure: "Tus «Me gusta» son secretos, salvo cuando el interés es mutuo.",
        resumeNote: "Guardamos lo que habías empezado.",
      },
    },
    genders: { woman: "Mujer", man: "Hombre", nonbinary: "No binario" },
    room: {
      enterKicker: "Te damos la bienvenida",
      enterLiveTag: "Noche en curso",
      enterReassure:
        "Tus «Me gusta» son secretos, salvo cuando el interés es mutuo.",
      errorTitle: "No se ha podido cargar esta página",
      loadError: "Actualiza la página para intentarlo de nuevo.",
      notFoundTitle: "Este enlace no corresponde a ningún bar",
      venueNotFound:
        "Escanea el QR que encontrarás en el bar para unirte a su noche de Amourette.",
      closedTitle: "No hay ninguna noche de Amourette disponible ahora",
      closedBody:
        "Escanea el QR del bar durante una noche de Amourette para unirte.",
      pausedTitle: "La noche está en pausa",
      pausedBody:
        "El acceso a esta noche está suspendido temporalmente. Esta página se actualizará si se reanuda.",
      cancelledTitle: "La noche se ha cancelado",
      cancelledBody:
        "Ya no cuentas como presente en esta noche de Amourette.",
      endedTitle: "La noche ha terminado",
      endedBody: "Los «Me gusta», matches y conversaciones de esta noche ya no están disponibles. Tu perfil sigue guardado.",
      backHome: "Volver al inicio",
      preLaunch: {
          title: "La noche se prepara.",
        body: "Ya te has unido a la noche. Cuando empiece, podrás ver quién está aquí y dar «Me gusta».",
        deadline: (time) => `Empezamos como muy tarde a las ${time}`,
        earlier: "Puede empezar antes si se han unido suficientes personas.",
        count: (count) => `${count} ${count === 1 ? "persona esperando" : "personas esperando"}`,
        emailPlaceholder: "tu@ejemplo.com",
        emailConsent: "Acepto recibir por email anuncios sobre las próximas noches de Amourette. Puedo darme de baja en cualquier momento.",
        emailConsentRequired: "Confirma que aceptas recibir estos emails.",
        emailSubmit: "Avísame",
        emailSaving: "Guardando…",
        emailNotNow: "Ahora no",
        emailConfirmed: "Te avisaremos de las próximas noches.",
        emailInvalid: "Ese email no parece válido.",
        emailError: "No se pudo guardar tu email. Inténtalo de nuevo.",
      },
      justArrived: "Acaba de unirse",
      newArrivalCue: "Un nuevo perfil por descubrir ↓",
      profileActions: "Más acciones",
      roomActions: "Opciones de la noche",
      editProfile: "Editar mi perfil",
      firstTimeHintTitle: "¿Te gusta alguien?",
      firstTimeHintBody:
        "Pulsa el corazón para decir «Me gusta». Si el interés es mutuo, tenéis un match y se abre una conversación. Si no, tu «Me gusta» sigue siendo secreto.",
      firstTimeHintDismiss: "Entendido",
      emailPromptTitle: "¿Te avisamos de las próximas noches?",
      emailPromptBody:
        "Deja tu email para recibir las próximas fechas.",
      emailPromptPlaceholder: "tu@ejemplo.com",
      emailPromptConsent:
        "Acepto recibir por email anuncios sobre las próximas noches de Amourette. Puedo darme de baja en cualquier momento.",
      emailPromptSubmit: "Avísame",
      emailPromptSaving: "Guardando…",
      emailPromptNotNow: "Ahora no",
      emailPromptClose: "Cerrar el registro por email",
      emailPromptSuccess: "Te avisaremos de las próximas noches.",
      emailPromptError: "No se pudo guardar tu email. Inténtalo de nuevo.",
      roomCount: (count) =>
        count === 1
          ? "persona en la sala ahora mismo (eres tú)"
          : "personas en la sala ahora mismo, contándote a ti",
      liveStatus: (count) => `${count} aquí ahora`,
      matchesCount: (count) => `${count} match${count === 1 ? "" : "es"}`,
      empty: {
        aloneTitle: "Todo está tranquilo en Amourette.",
        aloneBody:
          "De momento, no hay nadie más en Amourette en este bar.",
        emptiedTitle: "Ahora hay más calma en Amourette.",
        emptiedBody:
          "De momento, ya no hay nadie más en Amourette aquí.",
        liveTitle: "No hay perfiles disponibles por ahora.",
        liveBody:
          "Pueden aparecer nuevos perfiles a lo largo de la noche.",
        kicker: "Mientras tanto",
        feedDrained: "Por ahora, no quedan perfiles para mostrar.",
        heldArrival: "Hay un nuevo perfil disponible. Ver perfil",
      },
      bio: {
        emptyTitle: "Unas palabras para conocerte",
        emptyBody:
          "Una pasión o una anécdota puede ayudar a iniciar la conversación.",
        emptyBadge: "Opcional",
        fullTitle: "¿Quieres añadir un detalle?",
        fullBody: "Edita tu bio para contar un poco más de ti.",
      },
      emailCard: {
        title: "¿Te avisamos de las próximas noches?",
        body: "Deja tu email para recibir las próximas fechas.",
      },
      like: "Me gusta",
      liked: "Me gusta",
      removeLike: (name) => `Quitar mi «Me gusta» del perfil de ${name}`,
      likeError: "No se ha podido guardar tu «Me gusta». Inténtalo de nuevo.",
      unlikeError: "No se ha podido quitar tu «Me gusta». Inténtalo de nuevo.",
      leave: "Salir",
      leaveError: "No se ha podido salir. Inténtalo de nuevo.",
      leaveConfirmTitle: "¿Salir?",
      leaveConfirmBody:
        "Tu perfil dejará de mostrarse entre los perfiles disponibles y ya no contarás como presente. El envío de mensajes quedará en pausa.",
      leavePreserved:
        "Tus «Me gusta», matches y conversaciones se conservan hasta el final de la noche.",
      leaveStay: "Quedarme",
      leaveVenue: (venue) => `Salir de ${venue}`,
      leaving: "Saliendo…",
      goInvisible: "Ocultar mi perfil",
      invisibleTitle: "Tu perfil está oculto",
      invisibleBody:
        "Tu perfil ya no se muestra entre los perfiles disponibles y tú tampoco puedes explorar los demás. Sigues contando como presente y tus conversaciones siguen disponibles.",
      becomeVisible: "Hacer visible mi perfil",
      visibilityError: "No se ha podido cambiar la visibilidad de tu perfil. Inténtalo de nuevo.",
      matchKicker: "Un match",
      matchTitle: "Es mutuo.",
      matchBody:
        "¿Un primer mensaje para encontraros?",
      matchDismiss: "Volver a la noche",
      leftTitle: "¿De vuelta en el bar?",
      leftBody:
        "Vuelve a unirte para contar de nuevo como presente. Tus conversaciones podrán continuar si ambas personas están aquí antes de que termine la noche.",
      departedTitle: "Has salido",
      departedBody:
        "Ya no cuentas como presente y el envío de mensajes está en pausa. Tus «Me gusta», matches y conversaciones se conservan hasta el final de la noche.",
      rejoin: "Unirme a la noche",
      rejoinVenue: (venue) => `Unirme a ${venue} esta noche`,
      chat: "Abrir",
      openChat: "Escribir un mensaje",
      activeMatches: "Conversaciones",
      conversationHint:
        "Aquí encontrarás tus conversaciones después de un match.",
      openConversation: (name) => `Abrir conversación con ${name}`,
      block: "Bloquear",
      blockTitle: (name) => `¿Bloquear a ${name}?`,
      blockBody:
        "Vuestros perfiles dejarán de ser visibles el uno para el otro en Amourette y vuestras conversaciones se cerrarán. Esta persona no recibirá ninguna notificación.",
      blockReasonOptional: "Añadir un motivo (opcional)",
      blockReason: "Motivo del bloqueo",
      blockSubmit: "Bloquear a esta persona",
      blockConfirm: (name) => `¿Bloquear a ${name}? Vuestros perfiles dejarán de ser visibles el uno para el otro en Amourette y vuestras conversaciones se cerrarán. Esta persona no recibirá ninguna notificación.`,
      blockError: "No se ha podido bloquear a esta persona. Inténtalo de nuevo.",
      report: "Reportar",
      reportTitle: (name) => `Reportar a ${name}`,
      reportReason: "Motivo del reporte",
      reportNote: "Añadir detalles (opcional)",
      reportNoteRequired: "Explica qué ha pasado (obligatorio)",
      reportNoteRequiredError: "Si eliges «Otro», explica qué ha pasado.",
      reportSubmit: "Enviar reporte",
      reportCancel: "Cancelar",
      reportClose: "Cerrar",
      reportSuccess: "Tu reporte se ha enviado.",
      reportError: "No se ha podido enviar tu reporte. Inténtalo de nuevo.",
      reportEligibilityError: "Solo puedes reportar a alguien que se haya unido a la misma noche que tú.",
      reportBlockPrompt: "¿Quieres bloquear también a esta persona?",
      reportReasons: {
        harassment: "Acoso",
        fake_profile: "Perfil falso",
        underage: "Persona menor de edad",
        unsafe_behavior: "Comportamiento peligroso",
        other: "Otro",
      },
    },
    chat: {
      loading: "Abriendo la conversación…",
      unavailable: "No se ha podido abrir esta conversación.",
      backToRoom: "Volver a la noche",
      expiresTonight: "Abierto por esta noche.",
      empty: "Aún no hay mensajes. ¿Te apetece dar el primer paso?",
      typing: (name) => `${name} está escribiendo…`,
      send: "Enviar",
      sendError: "No se pudo enviar tu mensaje. Inténtalo de nuevo.",
      deliverySending: "Enviando…",
      deliveryFailed: "No enviado",
      deliveryRetry: "Reintentar",
      deliveryRetrying: "Reintentando…",
      deliveryRecovered: "Mensaje recuperado y enviado.",
      scrollToLatest: "Ir al último mensaje",
      newMessages: (count) =>
        count === 1 ? "1 mensaje nuevo" : `${count} mensajes nuevos`,
      closed: "Esta conversación ya no está disponible.",
      presence: "Aquí ahora",
      departed: "Ha salido",
      messagingPaused:
        "El envío de mensajes está en pausa. Podréis continuar si volvéis a estar aquí los dos antes de que termine la noche.",
      openerTitle: "Es mutuo.",
      openerNote: "Esta conversación está disponible hasta el final de la noche.",
      suggestions: ["¿Dónde estás en el bar?","¿Nos vemos junto a la barra?","¿Me acerco a saludarte?"],
      viewProfile: (name) => `Ver el perfil de ${name}`,
      closeProfile: "Cerrar el perfil",
      backToConversation: "Volver a la conversación",
    },
  },
};
