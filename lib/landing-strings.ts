import type { Locale } from "@/lib/strings";

// Landing page copy (#603). French is the founder-approved copy of docs/voice.md
// (section 3); English and Spanish adapt it with the same rules. `{amount}` is
// the deposit of the night on sale, formatted for the locale.

// A sentence with one hand-drawn mark: the felt pen circles, boxes or
// underlines `mark`, the text around it stays printed.
export type Marked = { before: string; mark: string; after: string };

export type LandingStrings = {
  headline: string;
  instagramLabel: string;
  ticketLabel: string; // "{date}", "{venue}", "{address}"
  atVenue: string;
  hours: string;
  hoursRange: string; // "{start}", "{end}"
  deposit: string;
  refunded: string;
  onArrival: string;
  stamp: readonly [string, string];
  book: string;
  fine: string;
  soonTitle: string;
  soonLead: string;
  loading: string;
  stepsTitle: string;
  steps: readonly { title: string; text: string }[];
  handTitle: Marked;
  hand: readonly [
    { title: Marked; text: string },
    { title: string; text: Marked },
    { title: Marked; text: string },
    { title: string; text: Marked },
  ];
  handNote: string;
  faqTitle: string;
  faq: readonly { q: string; short: string; a: string }[];
  followTitle: string;
  follow: string;
  footerLine: string;
  // The footer stub's two columns are narrow: a short label for the privacy policy.
  privacyLink: string;
  handle: string;
  languages: string;
};

const handle = "@amouretteapp";

export const landingStrings: Record<Locale, LandingStrings> = {
  fr: {
    headline: "Savoir si tu lui plais aussi.",
    instagramLabel: "Amourette sur Instagram",
    ticketLabel: "Soirée du {date} au bar {venue}, {address}",
    atVenue: "au bar",
    hours: "Horaires",
    hoursRange: "{start} à {end}",
    deposit: "Caution",
    refunded: "Remboursée",
    onArrival: "À l'arrivée",
    stamp: ["Entrée", "gratuite"],
    book: "Réserver sa place",
    fine: "Entrée gratuite · {amount} de caution remboursés sur ta carte à l'arrivée.",
    soonTitle: "Bientôt à Paris",
    soonLead: "La prochaine soirée est annoncée sur Instagram et par e-mail.",
    loading: "Chargement de la prochaine soirée",
    stepsTitle: "Comment ça se passe",
    steps: [
      { title: "Tu viens prendre un verre.", text: "En solo ou avec des amis, dans un bar normal. Tu scannes le QR sur place, rien à télécharger." },
      { title: "Tu vois qui participe.", text: "Ton prénom et ta photo apparaissent uniquement aux personnes présentes ce soir-là qui ont scanné le QR." },
      { title: "Tu likes, sans malaise.", text: "Si c'est réciproque, une discussion s'ouvre pour aller se parler au bar. Sinon, ça reste entre toi et ton téléphone." },
      { title: "À la fermeture, on tourne la page.", text: "Les likes et les messages disparaissent à la fin de la soirée. Ton profil reste prêt pour une prochaine fois." },
    ],
    handTitle: { before: "Tu gardes ", mark: "la main.", after: "" },
    hand: [
      { title: { before: "", mark: "Aucun message non sollicité.", after: "" }, text: "Personne ne peut t'écrire tant que tu n'as pas liké en retour." },
      { title: "Aucune obligation.", text: { before: "Un like réciproque ouvre une discussion, ", mark: "jamais un engagement.", after: "" } },
      { title: { before: "Uniquement ", mark: "sur place.", after: "" }, text: "Impossible d'écrire depuis chez soi avant ou après la soirée." },
      { title: "Des gens qui viennent vraiment.", text: { before: "La caution de {amount} est ", mark: "remboursée", after: " sur ta carte dès ton arrivée." } },
    ],
    handNote: "dès ton arrivée",
    faqTitle: "Questions",
    faq: [
      { q: "Pourquoi {amount} de caution ?", short: "Remboursée à l'arrivée.", a: "Pour que les personnes qui réservent viennent vraiment. Le remboursement sur ta carte est déclenché dès ton arrivée au bar." },
      { q: "Je dois télécharger quelque chose ?", short: "Non.", a: "Tu scannes le QR sur place et la page s'ouvre directement dans ton navigateur." },
      { q: "Je peux venir avec des amis ?", short: "Oui, c'est même l'idée.", a: "Tu viens boire un verre comme un jeudi normal. Chacun réserve sa place." },
      { q: "Que deviennent mes messages après la soirée ?", short: "Ils disparaissent.", a: "Les likes et les messages disparaissent à la fermeture. Ton prénom et ta photo restent enregistrés si tu reviens une autre fois." },
    ],
    followTitle: "Les prochaines soirées sont annoncées sur Instagram.",
    follow: `Suivre ${handle}`,
    footerLine: "Une soirée dans un bar à Paris.",
    privacyLink: "Confidentialité",
    handle,
    languages: "Langue",
  },
  en: {
    headline: "Find out if they like you back.",
    instagramLabel: "Amourette on Instagram",
    ticketLabel: "Night of {date} at {venue}, {address}",
    atVenue: "at",
    hours: "Hours",
    hoursRange: "{start}–{end}",
    deposit: "Deposit",
    refunded: "Refunded",
    onArrival: "On arrival",
    stamp: ["Free", "entry"],
    book: "Book your spot",
    fine: "Free entry · {amount} deposit refunded to your card when you arrive.",
    soonTitle: "Coming soon to Paris",
    soonLead: "The next night is announced on Instagram and by email.",
    loading: "Loading the next night",
    stepsTitle: "How it works",
    steps: [
      { title: "Come for a drink.", text: "On your own or with friends, in a regular bar. Scan the QR code there, nothing to download." },
      { title: "See who is taking part.", text: "Your first name and photo are shown only to people there that night who scanned the QR code." },
      { title: "Like someone, no awkwardness.", text: "If it's mutual, a conversation opens so you can go and talk at the bar. If not, it stays between you and your phone." },
      { title: "At closing time, the page turns.", text: "Likes and messages disappear at the end of the night. Your profile stays ready for next time." },
    ],
    handTitle: { before: "You stay ", mark: "in control.", after: "" },
    hand: [
      { title: { before: "", mark: "No unsolicited messages.", after: "" }, text: "Nobody can write to you unless you liked them back." },
      { title: "No obligation.", text: { before: "A mutual like opens a conversation, ", mark: "never a commitment.", after: "" } },
      { title: { before: "Only ", mark: "on site.", after: "" }, text: "You can't write from home before or after the night." },
      { title: "People who actually show up.", text: { before: "The {amount} deposit is ", mark: "refunded", after: " to your card as soon as you arrive." } },
    ],
    handNote: "as soon as you arrive",
    faqTitle: "Questions",
    faq: [
      { q: "Why a {amount} deposit?", short: "Refunded on arrival.", a: "So the people who book actually come. The refund to your card is triggered as soon as you arrive at the bar." },
      { q: "Do I need to download anything?", short: "No.", a: "Scan the QR code there and the page opens straight in your browser." },
      { q: "Can I come with friends?", short: "Yes, that's the idea.", a: "Come for a drink like any normal Thursday. Everyone books their own spot." },
      { q: "What happens to my messages after the night?", short: "They disappear.", a: "Likes and messages disappear at closing time. Your first name and photo stay saved if you come back another time." },
    ],
    followTitle: "Upcoming nights are announced on Instagram.",
    follow: `Follow ${handle}`,
    footerLine: "A night in a bar in Paris.",
    privacyLink: "Privacy",
    handle,
    languages: "Language",
  },
  es: {
    headline: "Saber si tú también le gustas.",
    instagramLabel: "Amourette en Instagram",
    ticketLabel: "Noche del {date} en el bar {venue}, {address}",
    atVenue: "en el bar",
    hours: "Horario",
    hoursRange: "{start} a {end}",
    deposit: "Depósito",
    refunded: "Reembolsado",
    onArrival: "Al llegar",
    stamp: ["Entrada", "gratis"],
    book: "Reservar plaza",
    fine: "Entrada gratis · {amount} de depósito reembolsados en tu tarjeta al llegar.",
    soonTitle: "Pronto en París",
    soonLead: "La próxima noche se anuncia en Instagram y por correo.",
    loading: "Cargando la próxima noche",
    stepsTitle: "Cómo funciona",
    steps: [
      { title: "Vienes a tomar algo.", text: "Solo o con amigos, en un bar normal. Escaneas el QR allí mismo, no hay nada que descargar." },
      { title: "Ves quién participa.", text: "Tu nombre y tu foto solo aparecen para las personas presentes esa noche que han escaneado el QR." },
      { title: "Das un like, sin incomodidad.", text: "Si es mutuo, se abre una conversación para ir a hablar en la barra. Si no, queda entre tú y tu móvil." },
      { title: "Al cierre, se pasa página.", text: "Los likes y los mensajes desaparecen al final de la noche. Tu perfil queda listo para la próxima vez." },
    ],
    handTitle: { before: "Tú ", mark: "decides.", after: "" },
    hand: [
      { title: { before: "", mark: "Ningún mensaje no deseado.", after: "" }, text: "Nadie puede escribirte si tú no le has dado like también." },
      { title: "Ninguna obligación.", text: { before: "Un like mutuo abre una conversación, ", mark: "nunca un compromiso.", after: "" } },
      { title: { before: "Solo ", mark: "en el lugar.", after: "" }, text: "Imposible escribir desde casa antes o después de la noche." },
      { title: "Gente que viene de verdad.", text: { before: "El depósito de {amount} se ", mark: "reembolsa", after: " en tu tarjeta en cuanto llegas." } },
    ],
    handNote: "en cuanto llegas",
    faqTitle: "Preguntas",
    faq: [
      { q: "¿Por qué {amount} de depósito?", short: "Reembolsado al llegar.", a: "Para que las personas que reservan vengan de verdad. El reembolso en tu tarjeta se activa en cuanto llegas al bar." },
      { q: "¿Tengo que descargar algo?", short: "No.", a: "Escaneas el QR allí mismo y la página se abre directamente en tu navegador." },
      { q: "¿Puedo ir con amigos?", short: "Sí, es la idea.", a: "Vienes a tomar algo como un jueves cualquiera. Cada uno reserva su plaza." },
      { q: "¿Qué pasa con mis mensajes después de la noche?", short: "Desaparecen.", a: "Los likes y los mensajes desaparecen al cierre. Tu nombre y tu foto quedan guardados si vuelves otra vez." },
    ],
    followTitle: "Las próximas noches se anuncian en Instagram.",
    follow: `Seguir a ${handle}`,
    footerLine: "Una noche en un bar de París.",
    privacyLink: "Privacidad",
    handle,
    languages: "Idioma",
  },
};
