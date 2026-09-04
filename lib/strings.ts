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
    entering: string;
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
        "Couldn't start your session. Anonymous sign-in may be disabled for this project.",
      welcomeBack: "Welcome back",
      newVisitorLead: "Scan the QR at the bar to join the night.",
      returningLead: "Scan your bar's QR to check in tonight.",
      yourProfile: "Your profile",
      editProfile: "Edit my profile",
      activeChatTitle: "Still on tonight",
      openChatWith: (name) => `Open your chat with ${name}`,
      devEnterVenue: "Dev · enter test venue",
      kicker: "The bar · tonight",
      promise: "The people in this bar, without the fear of the first move.",
      how: ["Scan at the door", "Like in secret", "Match to talk"],
      waitlistLabel: "No Amourette bar near you yet?",
      waitlistPlaceholder: "you@email.com",
      waitlistHelp: "We'll ping you only when one opens nearby. Nothing else.",
      waitlistCta: "Join the list",
      waitlistSuccess: "You're on the list. See you at the bar.",
      waitlistAlready: "You're already on the list. See you at the bar.",
      waitlistInvalid: "That email doesn't look right.",
      waitlistError: "Couldn't save that. Try again in a moment.",
    },
    profile: {
      title: "Your profile is your vibe",
      subtitle: "A real first name, a clear photo, and the energy you bring.",
      editTitle: "Edit your profile",
      editSubtitle: "Update your photo, name, bio, or who you want to meet.",
      saveChanges: "Save changes",
      back: "Back",
      youSection: "You",
      discardTitle: "Discard changes?",
      discardBody: "Your edits haven't been saved yet.",
      discardConfirm: "Discard",
      discardKeep: "Keep editing",
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
      firstNameTooLong: "Your first name must be 30 characters or fewer.",
      bioTooLong: "Your bio must be 500 characters or fewer.",
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
      onb: {
        stepOf: (n, total) => `Step ${n} of ${total}`,
        namePrompt: "What should we call you?",
        nameHelp: "Your first name, the way people know you.",
        photoPrompt: "Show yourself",
        photoHelp: "A clear photo of your face. This is what the room sees.",
        genderPrompt: "You are…",
        interestPrompt: "You'd like to meet…",
        interestHelp: "Pick one or more.",
        bioPrompt: "A few words about you",
        bioHelp: "Optional — what you drink, what makes you laugh.",
        previewKicker: "This is how you'll appear",
        changePhoto: "Change photo",
        continue: "Continue",
        reassure: "You stay in control of who sees you",
        resumeNote: "We kept what you'd started.",
      },
    },
    genders: { woman: "Woman", man: "Man", nonbinary: "Non-binary" },
    room: {
      entering: "Walking into the room…",
      enterKicker: "You're walking into",
      enterLiveTag: "live tonight",
      enterReassure:
        "No one will know who you like, unless it's mutual.",
      errorTitle: "That didn't work",
      loadError: "Couldn't load the room. Please try again.",
      notFoundTitle: "This link leads nowhere",
      venueNotFound: "This room doesn't exist. Scan the QR at the bar's door.",
      closedTitle: "The night hasn't started yet",
      closedBody:
        "No Amourette night is open here right now. Scan the venue QR again when the waiting room opens.",
      pausedTitle: "The night is taking a pause",
      pausedBody:
        "The room is temporarily closed. Stay here — it will reopen automatically if the night resumes.",
      cancelledTitle: "Tonight has been cancelled",
      cancelledBody:
        "This Amourette night will not open. Your waiting-room presence has ended.",
      endedTitle: "Tonight is over",
      endedBody: "This Amourette night has ended. See you at the next one.",
      backHome: "Back to the entrance",
      preLaunch: {
          title: "The room is getting ready.",
        body: "Your profile is checked in. No one can browse or like anyone until the room opens.",
        deadline: (time) => `Opening by ${time} at the latest`,
        earlier: "It may open earlier as soon as enough people have checked in.",
        count: (count) => `${count} ${count === 1 ? "person is" : "people are"} waiting`,
        emailPlaceholder: "you@email.com",
        emailConsent: "I agree to receive email announcements about upcoming Amourette nights. I can unsubscribe at any time.",
        emailConsentRequired: "Please confirm that you agree to receive these emails.",
        emailSubmit: "Keep me posted",
        emailSaving: "Saving…",
        emailNotNow: "Not now",
        emailConfirmed: "Signup confirmed",
        emailInvalid: "That email doesn't look right.",
        emailError: "Couldn't save your email. Try again.",
      },
      justArrived: "Just arrived",
      newArrivalCue: "Someone just arrived ↓",
      profileActions: "More actions",
      roomActions: "Room options",
      editProfile: "Edit my profile",
      firstTimeHintTitle: "Tap quietly",
      firstTimeHintBody:
        "No one is ever told they were tapped. A chat opens only if you both tap — so you stay in control of your attention.",
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
      emailPromptSuccess: "You're on the list. Enjoy your night.",
      emailPromptError: "Couldn't save your email. Try again.",
      roomCount: (count) =>
        count === 1
          ? "person in the room right now — that's you"
          : "people in the room right now, counting you",
      liveStatus: (count) => `${count} here now`,
      matchesCount: (count) => `${count} ${count === 1 ? "match" : "matches"}`,
      empty: {
        aloneTitle: "It's still early.",
        aloneBody:
          "You're on your own here for now. The room fills up as people scan on their way in.",
        emptiedTitle: "The room has emptied.",
        emptiedBody:
          "Everyone's gone for now. People come and go all night.",
        liveTitle: "The night is on.",
        liveBody:
          "People come and go all night. The moment someone turns up for you, they show up here.",
        kicker: "Meanwhile",
        feedDrained: "No one left to see for now",
        heldArrival: "Someone just arrived. See them",
      },
      bio: {
        emptyTitle: "Your bio is empty",
        emptyBody:
          "One line, and you go from just a photo to someone worth noticing. It's your only real edge tonight.",
        emptyBadge: "Incomplete",
        fullTitle: "Polish your profile",
        fullBody: "One more detail never hurts.",
      },
      emailCard: {
        title: "More nights like this one?",
        body: "Leave your email to hear about upcoming Amourette nights.",
      },
      like: "Tap",
      liked: "Tapped",
      removeLike: (name) => `Remove your tap from ${name}`,
      likeError: "Couldn't register your like. Try again.",
      unlikeError: "Couldn't remove your like. Try again.",
      leave: "Leave the venue",
      leaveError: "Couldn't leave the room. Try again.",
      leaveConfirmTitle: "Leave the venue?",
      leaveConfirmBody:
        "You'll disappear from discovery and no longer count as being here.",
      leavePreserved:
        "Your likes, matches, and conversations from tonight won't be deleted.",
      leaveStay: "Stay at the venue",
      leaveVenue: (venue) => `Leave ${venue}`,
      leaving: "Leaving…",
      goInvisible: "Pause discovery",
      invisibleTitle: "Discovery is paused",
      invisibleBody:
        "Your profile is hidden from the room, but you're still checked in and your conversations stay open. Tap below to be visible again right away.",
      becomeVisible: "Resume discovery",
      visibilityError: "Couldn't update your visibility. Try again.",
      matchKicker: "Mutual energy",
      matchTitle: "You both tapped",
      matchBody:
        "Keep it light, respectful, and in the moment. You're both here, right now.",
      matchDismiss: "See who else is here",
      leftTitle: "Welcome back",
      leftBody:
        "Join the venue again to return to discovery and be counted as here. Tonight's likes, matches, and conversations are still waiting for you.",
      departedTitle: "You've left the venue",
      departedBody:
        "You're no longer in discovery or counted as here. Tonight's likes, matches, and conversations are preserved.",
      rejoin: "Re-join the room",
      rejoinVenue: (venue) => `Join ${venue} tonight`,
      chat: "Open",
      openChat: "Start the chat",
      activeMatches: "Conversations",
      conversationHint: "Mutual taps live here. Keep it warm, then say hi.",
      openConversation: (name) => `Open conversation with ${name}`,
      block: "Block",
      blockTitle: (name) => `Block ${name}?`,
      blockBody:
        "You will no longer see each other, and any match or chat between you will close. They are never told.",
      blockReasonOptional: "Add a reason (optional)",
      blockSubmit: "Block this person",
      blockConfirm: (name) =>
        `Block ${name}? You will no longer see each other, and any match or chat will close.`,
      blockError: "Couldn't block this person. Try again.",
      report: "Report",
      reportTitle: (name) => `Report ${name}`,
      reportReason: "Reason",
      reportNote: "Add a note (optional)",
      reportNoteRequired: "Explain what happened (required)",
      reportNoteRequiredError: "Please explain what happened when selecting Other.",
      reportSubmit: "Submit report",
      reportCancel: "Cancel",
      reportSuccess: "Report submitted.",
      reportError: "Couldn't submit the report. Try again.",
      reportEligibilityError: "You can only report users you shared a venue night with.",
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
      closed: "This match has expired for the night.",
      presence: "In the room",
      departed: "Left the venue",
      messagingPaused:
        "Messaging is paused while one of you is away. You can continue if you are both back here tonight.",
      openerTitle: "You both tapped.",
      openerNote: "Over a drink",
      suggestions: ["Where are you in the room?", "Want to meet by the bar?", "Should I come say hi?"],
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
        "Impossible de démarrer ta session. La connexion anonyme est peut-être désactivée.",
      welcomeBack: "Content de te revoir",
      newVisitorLead: "Scanne le QR à l'entrée du bar pour rejoindre la soirée.",
      returningLead: "Scanne le QR de ton bar pour te check-in ce soir.",
      yourProfile: "Ton profil",
      editProfile: "Modifier mon profil",
      activeChatTitle: "Encore en cours ce soir",
      openChatWith: (name) => `Ouvrir ton chat avec ${name}`,
      devEnterVenue: "Dev · entrer dans le lieu de test",
      kicker: "Le bar · ce soir",
      promise: "Les gens de ce bar, sans la peur du premier pas.",
      how: ["Scanne à l'entrée", "Craque en secret", "Match pour parler"],
      waitlistLabel: "Pas encore de bar Amourette près de chez toi ?",
      waitlistPlaceholder: "toi@email.com",
      waitlistHelp: "On te prévient seulement quand un bar ouvre près de toi. Rien d'autre.",
      waitlistCta: "Rejoindre la liste",
      waitlistSuccess: "Tu es sur la liste. À très vite au bar.",
      waitlistAlready: "Tu es déjà sur la liste. À très vite au bar.",
      waitlistInvalid: "Cet email a l'air incorrect.",
      waitlistError: "Enregistrement impossible. Réessaie dans un instant.",
    },
    profile: {
      title: "Ton profil, ton énergie",
      subtitle: "Un vrai prénom, une photo claire, et l'énergie que tu amènes.",
      editTitle: "Modifier ton profil",
      editSubtitle: "Mets à jour ta photo, ton prénom, ta bio ou qui tu veux rencontrer.",
      saveChanges: "Enregistrer les modifications",
      back: "Retour",
      youSection: "Toi",
      discardTitle: "Abandonner les modifications ?",
      discardBody: "Tes changements n'ont pas encore été enregistrés.",
      discardConfirm: "Abandonner",
      discardKeep: "Continuer les modifications",
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
      firstNameTooLong: "Ton prénom doit contenir 30 caractères maximum.",
      bioTooLong: "Ta bio doit contenir 500 caractères maximum.",
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
      onb: {
        stepOf: (n, total) => `Étape ${n} sur ${total}`,
        namePrompt: "On t'appelle comment ?",
        nameHelp: "Ton prénom, celui qu'on te connaît.",
        photoPrompt: "Montre-toi",
        photoHelp: "Une photo claire de ton visage. C'est ce que la salle verra.",
        genderPrompt: "Tu es…",
        interestPrompt: "Tu veux rencontrer…",
        interestHelp: "Choisis une ou plusieurs options.",
        bioPrompt: "Deux mots sur toi",
        bioHelp: "Optionnel — ce que tu bois, ce qui te fait rire.",
        previewKicker: "Voici comment on te verra",
        changePhoto: "Changer la photo",
        continue: "Continuer",
        reassure: "Tu gardes le contrôle de qui te voit",
        resumeNote: "On a gardé ce que tu avais commencé.",
      },
    },
    genders: { woman: "Femme", man: "Homme", nonbinary: "Non-binaire" },
    room: {
      entering: "On entre dans la salle…",
      enterKicker: "Tu entres chez",
      enterLiveTag: "en salle ce soir",
      enterReassure:
        "Personne ne saura qui tu likes, sauf si c'est réciproque.",
      errorTitle: "Ça n'a pas marché",
      loadError: "Impossible de charger la salle. Réessaie.",
      notFoundTitle: "Ce lien ne mène nulle part",
      venueNotFound:
        "Cette salle n'existe pas. Scanne le QR à l'entrée du bar.",
      closedTitle: "La soirée n'a pas encore commencé",
      closedBody:
        "Aucune soirée Amourette n'est ouverte ici pour le moment. Rescanne le QR du lieu quand la salle d'attente ouvrira.",
      pausedTitle: "La soirée fait une pause",
      pausedBody:
        "La salle est temporairement fermée. Reste ici — elle se rouvrira automatiquement si la soirée reprend.",
      cancelledTitle: "La soirée est annulée",
      cancelledBody:
        "Cette soirée Amourette n'ouvrira pas. Ta présence dans la salle d'attente est terminée.",
      endedTitle: "La soirée est terminée",
      endedBody: "Cette soirée Amourette est terminée. À la prochaine.",
      backHome: "Retour à l'entrée",
      preLaunch: {
          title: "La salle se prépare.",
        body: "Ton profil est bien enregistré. Personne ne peut parcourir ou liker les profils avant l'ouverture.",
        deadline: (time) => `Ouverture au plus tard à ${time}`,
        earlier: "Elle peut ouvrir plus tôt dès qu'assez de personnes sont arrivées.",
        count: (count) => `${count} personne${count > 1 ? "s" : ""} en attente`,
        emailPlaceholder: "toi@exemple.com",
        emailConsent: "J’accepte de recevoir par email les annonces des prochaines soirées Amourette. Je pourrai me désinscrire à tout moment.",
        emailConsentRequired: "Confirme que tu acceptes de recevoir ces emails.",
        emailSubmit: "Me prévenir",
        emailSaving: "Enregistrement…",
        emailNotNow: "Pas maintenant",
        emailConfirmed: "Inscription confirmée",
        emailInvalid: "Cette adresse email ne semble pas valide.",
        emailError: "Impossible d’enregistrer ton email. Réessaie.",
      },
      justArrived: "Vient d'arriver",
      newArrivalCue: "Quelqu'un vient d'arriver ↓",
      profileActions: "Plus d'actions",
      roomActions: "Options de la salle",
      editProfile: "Modifier mon profil",
      firstTimeHintTitle: "Craque discrètement",
      firstTimeHintBody:
        "Personne n'est jamais prévenu qu'on a craqué pour lui. Un chat s'ouvre seulement si vous craquez tous les deux — tu gardes le contrôle de ton attention.",
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
      emailPromptSuccess: "C'est noté, profite de ta soirée.",
      emailPromptError: "Impossible d'enregistrer ton email. Réessaie.",
      roomCount: (count) =>
        count > 1
          ? "personnes dans la salle en ce moment, en te comptant"
          : "personne dans la salle en ce moment — c'est toi",
      liveStatus: (count) => `${count} sur place`,
      matchesCount: (count) => `${count} match${count === 1 ? "" : "s"}`,
      empty: {
        aloneTitle: "C'est encore calme.",
        aloneBody:
          "Tu es seul·e ici pour l'instant. La salle se remplit au fur et à mesure que les gens scannent en entrant.",
        emptiedTitle: "La salle s'est vidée.",
        emptiedBody:
          "Tout le monde est reparti pour le moment. Les gens vont et viennent toute la nuit.",
        liveTitle: "La soirée est lancée.",
        liveBody:
          "Les gens arrivent et repartent toute la nuit. Dès que quelqu'un entre pour toi, il apparaît ici.",
        kicker: "En attendant",
        feedDrained: "Il n'y a plus personne à voir pour l'instant",
        heldArrival: "Quelqu'un vient d'arriver. Voir la personne",
      },
      bio: {
        emptyTitle: "Ta bio est vide",
        emptyBody:
          "Une phrase, et tu passes de simple photo à quelqu'un qu'on remarque. C'est ton seul vrai levier ce soir.",
        emptyBadge: "À compléter",
        fullTitle: "Peaufine ton profil",
        fullBody: "Un détail de plus ne fait jamais de mal.",
      },
      emailCard: {
        title: "D'autres soirées comme celle-ci ?",
        body: "Laisse ton email pour être au courant des prochaines soirées Amourette.",
      },
      like: "Craquer",
      liked: "Craqué",
      removeLike: (name) => `Retirer ton coup de cœur pour ${name}`,
      likeError: "Ton coup de cœur n'a pas pu être enregistré. Réessaie.",
      unlikeError: "Ton coup de cœur n'a pas pu être retiré. Réessaie.",
      leave: "Quitter le lieu",
      leaveError: "Impossible de quitter la salle. Réessaie.",
      leaveConfirmTitle: "Quitter le lieu ?",
      leaveConfirmBody:
        "Tu disparaîtras de l'exploration et ne seras plus compté·e sur place.",
      leavePreserved:
        "Tes coups de cœur, matchs et conversations de ce soir ne seront pas supprimés.",
      leaveStay: "Rester sur place",
      leaveVenue: (venue) => `Quitter ${venue}`,
      leaving: "Départ…",
      goInvisible: "Mettre l'exploration en pause",
      invisibleTitle: "L'exploration est en pause",
      invisibleBody:
        "Ton profil est caché dans la salle, mais tu restes compté·e sur place et tes conversations restent accessibles. Appuie ci-dessous pour redevenir visible tout de suite.",
      becomeVisible: "Reprendre l'exploration",
      visibilityError: "Impossible de changer ta visibilité. Réessaie.",
      matchKicker: "Énergie mutuelle",
      matchTitle: "Vous avez craqué",
      matchBody:
        "Reste léger, respectueux, et dans le moment. Vous êtes là tous les deux, maintenant.",
      matchDismiss: "Voir qui est là",
      leftTitle: "Bon retour",
      leftBody:
        "Rejoins à nouveau le lieu pour retrouver l'exploration et être compté·e sur place. Tes coups de cœur, matchs et conversations de ce soir t'attendent.",
      departedTitle: "Tu as quitté le lieu",
      departedBody:
        "Tu n'apparais plus dans l'exploration et n'es plus compté·e sur place. Tes coups de cœur, matchs et conversations de ce soir sont conservés.",
      rejoin: "Revenir dans la salle",
      rejoinVenue: (venue) => `Rejoindre ${venue} ce soir`,
      chat: "Ouvrir",
      openChat: "Démarrer le chat",
      activeMatches: "Conversations",
      conversationHint:
        "Les coups de cœur mutuels vivent ici. Reste chaleureux, puis va dire bonjour.",
      openConversation: (name) => `Ouvrir la conversation avec ${name}`,
      block: "Bloquer",
      blockTitle: (name) => `Bloquer ${name} ?`,
      blockBody:
        "Vous ne vous verrez plus, et tout match ou chat entre vous sera fermé. La personne n'en est jamais informée.",
      blockReasonOptional: "Ajouter une raison (optionnel)",
      blockSubmit: "Bloquer cette personne",
      blockConfirm: (name) =>
        `Bloquer ${name} ? Vous ne vous verrez plus, et tout match ou chat sera fermé.`,
      blockError: "Impossible de bloquer cette personne. Réessaie.",
      report: "Signaler",
      reportTitle: (name) => `Signaler ${name}`,
      reportReason: "Raison",
      reportNote: "Ajouter une note (optionnel)",
      reportNoteRequired: "Explique ce qui s'est passé (obligatoire)",
      reportNoteRequiredError: "Explique ce qui s'est passé lorsque tu sélectionnes Autre.",
      reportSubmit: "Envoyer le signalement",
      reportCancel: "Annuler",
      reportSuccess: "Signalement envoyé.",
      reportError: "Impossible d'envoyer le signalement. Réessaie.",
      reportEligibilityError: "Tu peux uniquement signaler une personne présente à la même soirée.",
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
      closed: "Ce match a expiré pour la soirée.",
      presence: "Dans la salle",
      departed: "A quitté le lieu",
      messagingPaused:
        "La messagerie est en pause tant que l'un de vous n'est plus sur place. Vous pourrez continuer si vous revenez tous les deux ce soir.",
      openerTitle: "Vous avez tapé tous les deux.",
      openerNote: "Le temps d'un verre",
      suggestions: ["Tu es où dans la salle ?", "On se retrouve près du bar ?", "Je viens te dire bonjour ?"],
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
        "No se pudo iniciar tu sesión. Puede que el inicio anónimo esté desactivado.",
      welcomeBack: "Bienvenido de nuevo",
      newVisitorLead: "Escanea el QR en la entrada del bar para unirte a la noche.",
      returningLead: "Escanea el QR de tu bar para registrarte esta noche.",
      yourProfile: "Tu perfil",
      editProfile: "Editar mi perfil",
      activeChatTitle: "Sigue activo esta noche",
      openChatWith: (name) => `Abrir tu chat con ${name}`,
      devEnterVenue: "Dev · entrar al lugar de prueba",
      kicker: "El bar · esta noche",
      promise: "La gente de este bar, sin el miedo al primer paso.",
      how: ["Escanea en la entrada", "Flecha en secreto", "Match para hablar"],
      waitlistLabel: "¿Aún no hay un bar Amourette cerca de ti?",
      waitlistPlaceholder: "tu@email.com",
      waitlistHelp: "Te avisamos solo cuando abra uno cerca. Nada más.",
      waitlistCta: "Unirme a la lista",
      waitlistSuccess: "Estás en la lista. Nos vemos en el bar.",
      waitlistAlready: "Ya estás en la lista. Nos vemos en el bar.",
      waitlistInvalid: "Ese email no parece correcto.",
      waitlistError: "No se pudo guardar. Inténtalo en un momento.",
    },
    profile: {
      title: "Tu perfil es tu vibra",
      subtitle: "Un nombre real, una foto clara y la energía que traes.",
      editTitle: "Editar tu perfil",
      editSubtitle: "Actualiza tu foto, tu nombre, tu bio o a quién quieres conocer.",
      saveChanges: "Guardar cambios",
      back: "Volver",
      youSection: "Tú",
      discardTitle: "¿Descartar los cambios?",
      discardBody: "Tus cambios aún no se han guardado.",
      discardConfirm: "Descartar",
      discardKeep: "Seguir editando",
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
      firstNameTooLong: "Tu nombre debe tener 30 caracteres como máximo.",
      bioTooLong: "Tu bio debe tener 500 caracteres como máximo.",
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
      onb: {
        stepOf: (n, total) => `Paso ${n} de ${total}`,
        namePrompt: "¿Cómo te llamamos?",
        nameHelp: "Tu nombre, el que la gente conoce.",
        photoPrompt: "Muéstrate",
        photoHelp: "Una foto clara de tu cara. Es lo que verá la sala.",
        genderPrompt: "Eres…",
        interestPrompt: "Quieres conocer…",
        interestHelp: "Elige una o varias opciones.",
        bioPrompt: "Unas palabras sobre ti",
        bioHelp: "Opcional — qué bebes, qué te hace reír.",
        previewKicker: "Así es como te verán",
        changePhoto: "Cambiar foto",
        continue: "Continuar",
        reassure: "Tú controlas quién te ve",
        resumeNote: "Guardamos lo que habías empezado.",
      },
    },
    genders: { woman: "Mujer", man: "Hombre", nonbinary: "No binario" },
    room: {
      entering: "Entrando en la sala…",
      enterKicker: "Estás entrando en",
      enterLiveTag: "en la sala esta noche",
      enterReassure:
        "Nadie sabrá a quién marcas, salvo si es recíproco.",
      errorTitle: "No funcionó",
      loadError: "No se pudo cargar la sala. Inténtalo de nuevo.",
      notFoundTitle: "Este enlace no lleva a ninguna parte",
      venueNotFound:
        "Esta sala no existe. Escanea el QR en la puerta del bar.",
      closedTitle: "La noche aún no ha empezado",
      closedBody:
        "Ahora mismo no hay ninguna noche Amourette abierta aquí. Vuelve a escanear el QR del local cuando abra la sala de espera.",
      pausedTitle: "La noche está en pausa",
      pausedBody:
        "La sala está cerrada temporalmente. Quédate aquí — se abrirá sola si la noche continúa.",
      cancelledTitle: "La noche ha sido cancelada",
      cancelledBody:
        "Esta noche Amourette no abrirá. Tu presencia en la sala de espera ha terminado.",
      endedTitle: "La noche ha terminado",
      endedBody: "Esta noche Amourette ha terminado. Nos vemos en la próxima.",
      backHome: "Volver a la entrada",
      preLaunch: {
          title: "La sala se está preparando.",
        body: "Tu perfil ya está registrado. Nadie puede ver ni marcar perfiles antes de que abra la sala.",
        deadline: (time) => `Abrimos como muy tarde a las ${time}`,
        earlier: "Puede abrir antes en cuanto haya llegado suficiente gente.",
        count: (count) => `${count} ${count === 1 ? "persona esperando" : "personas esperando"}`,
        emailPlaceholder: "tu@ejemplo.com",
        emailConsent: "Acepto recibir por email anuncios sobre las próximas noches de Amourette. Puedo darme de baja en cualquier momento.",
        emailConsentRequired: "Confirma que aceptas recibir estos emails.",
        emailSubmit: "Avísame",
        emailSaving: "Guardando…",
        emailNotNow: "Ahora no",
        emailConfirmed: "Inscripción confirmada",
        emailInvalid: "Ese email no parece válido.",
        emailError: "No se pudo guardar tu email. Inténtalo de nuevo.",
      },
      justArrived: "Acaba de llegar",
      newArrivalCue: "Alguien acaba de llegar ↓",
      profileActions: "Más acciones",
      roomActions: "Opciones de la sala",
      editProfile: "Editar mi perfil",
      firstTimeHintTitle: "Flecha con discreción",
      firstTimeHintBody:
        "A nadie se le avisa de que le has flechado. Un chat se abre solo si os flecháis los dos — tú controlas tu atención.",
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
      emailPromptSuccess: "Anotado, disfruta de tu noche.",
      emailPromptError: "No se pudo guardar tu email. Inténtalo de nuevo.",
      roomCount: (count) =>
        count === 1
          ? "persona en la sala ahora mismo — eres tú"
          : "personas en la sala ahora mismo, contándote a ti",
      liveStatus: (count) => `${count} aquí ahora`,
      matchesCount: (count) => `${count} match${count === 1 ? "" : "es"}`,
      empty: {
        aloneTitle: "Todavía está tranquilo.",
        aloneBody:
          "De momento estás solo aquí. La sala se llena a medida que la gente escanea al entrar.",
        emptiedTitle: "La sala se ha vaciado.",
        emptiedBody:
          "Por ahora todos se han ido. La gente entra y sale durante toda la noche.",
        liveTitle: "La noche ya empezó.",
        liveBody:
          "La gente entra y sale durante toda la noche. En cuanto llegue alguien para ti, aparecerá aquí.",
        kicker: "Mientras tanto",
        feedDrained: "Ya no queda nadie por ver por ahora",
        heldArrival: "Acaba de llegar alguien. Ver el perfil",
      },
      bio: {
        emptyTitle: "Tu bio está vacía",
        emptyBody:
          "Una frase, y pasas de ser solo una foto a alguien que se nota. Es tu única ventaja real esta noche.",
        emptyBadge: "Incompleta",
        fullTitle: "Pule tu perfil",
        fullBody: "Un detalle más nunca viene mal.",
      },
      emailCard: {
        title: "¿Más noches como esta?",
        body: "Déjanos tu correo para enterarte de las próximas noches de Amourette.",
      },
      like: "Flechar",
      liked: "Flechado",
      removeLike: (name) => `Retirar tu flechazo de ${name}`,
      likeError: "No se pudo registrar tu flechazo. Inténtalo de nuevo.",
      unlikeError: "No se pudo retirar tu flechazo. Inténtalo de nuevo.",
      leave: "Salir del local",
      leaveError: "No se pudo salir de la sala. Inténtalo de nuevo.",
      leaveConfirmTitle: "¿Salir del local?",
      leaveConfirmBody:
        "Desaparecerás del descubrimiento y dejarás de contar como presente.",
      leavePreserved:
        "Tus flechazos, matches y conversaciones de esta noche no se borrarán.",
      leaveStay: "Quedarme en el local",
      leaveVenue: (venue) => `Salir de ${venue}`,
      leaving: "Saliendo…",
      goInvisible: "Pausar descubrimiento",
      invisibleTitle: "El descubrimiento está en pausa",
      invisibleBody:
        "Tu perfil está oculto en la sala, pero sigues contando como presente y tus conversaciones siguen disponibles. Toca abajo para volver a aparecer al instante.",
      becomeVisible: "Reanudar descubrimiento",
      visibilityError: "No se pudo cambiar tu visibilidad. Inténtalo de nuevo.",
      matchKicker: "Flechazo mutuo",
      matchTitle: "Os habéis flechado",
      matchBody:
        "Manténlo ligero, respetuoso y en el momento. Estáis aquí los dos, ahora mismo.",
      matchDismiss: "Ver quién más está aquí",
      leftTitle: "Qué bueno verte de nuevo",
      leftBody:
        "Vuelve a unirte al local para regresar al descubrimiento y contar como presente. Tus flechazos, matches y conversaciones de esta noche te esperan.",
      departedTitle: "Has salido del local",
      departedBody:
        "Ya no apareces en descubrimiento ni cuentas como presente. Tus flechazos, matches y conversaciones de esta noche se conservan.",
      rejoin: "Volver a la sala",
      rejoinVenue: (venue) => `Unirme a ${venue} esta noche`,
      chat: "Abrir",
      openChat: "Iniciar el chat",
      activeMatches: "Conversaciones",
      conversationHint:
        "Los flechazos mutuos viven aquí. Manténlo cálido y luego ve a saludar.",
      openConversation: (name) => `Abrir conversación con ${name}`,
      block: "Bloquear",
      blockTitle: (name) => `¿Bloquear a ${name}?`,
      blockBody:
        "Ya no se verán, y cualquier match o chat entre vosotros se cerrará. La persona nunca lo sabrá.",
      blockReasonOptional: "Añadir un motivo (opcional)",
      blockSubmit: "Bloquear a esta persona",
      blockConfirm: (name) =>
        `¿Bloquear a ${name}? Ya no se verán, y cualquier match o chat se cerrará.`,
      blockError: "No se pudo bloquear a esta persona. Inténtalo de nuevo.",
      report: "Reportar",
      reportTitle: (name) => `Reportar a ${name}`,
      reportReason: "Razón",
      reportNote: "Añadir una nota (opcional)",
      reportNoteRequired: "Explica qué ocurrió (obligatorio)",
      reportNoteRequiredError: "Explica qué ocurrió cuando selecciones Otro.",
      reportSubmit: "Enviar reporte",
      reportCancel: "Cancelar",
      reportSuccess: "Reporte enviado.",
      reportError: "No se pudo enviar el reporte. Inténtalo de nuevo.",
      reportEligibilityError: "Solo puedes reportar a alguien que estuvo en la misma noche del local.",
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
      closed: "Este match ha expirado por la noche.",
      presence: "En la sala",
      departed: "Ha salido del local",
      messagingPaused:
        "Los mensajes están en pausa mientras uno de vosotros no esté allí. Podréis continuar si ambos volvéis esta noche.",
      openerTitle: "Se han gustado los dos.",
      openerNote: "El tiempo de una copa",
      suggestions: ["¿Dónde estás en la sala?", "¿Nos vemos junto a la barra?", "¿Me acerco a saludarte?"],
      viewProfile: (name) => `Ver el perfil de ${name}`,
      closeProfile: "Cerrar el perfil",
      backToConversation: "Volver a la conversación",
    },
  },
};
