// Synthetic roster for the venue-pitch demo room (/v/demo). Edit this file to
// change the room: order is the feed order (oldest check-in first), `armed`
// profiles pre-like the founder's demo profile so liking them opens a real match.
// Text is French because the room is shown to Paris bar managers.

export const DEMO_SLUG = "demo";
export const DEMO_VENUE_NAME = "Soirée démo Amourette";
export const DEMO_SEED = "venue-pitch-demo-v1";
export const DEMO_PHOTO_DIR = "demo-profiles";
export const MAX_ARMED = 8;

const genders = ["woman", "man", "nonbinary"];

// The founder's demo profile is a man interested in women: the first 12 are his
// feed. Positions 3 to 10 are armed, so "the third card is always armed": a
// matched profile leaves the feed and the next armed one moves up to third.
// The others keep the room count credible and give a manager who tries on their
// own phone a populated feed whatever their answers.
export const DEMO_ROSTER = [
  { key: "demo-01", firstName: "Camille", gender: "woman", interestedIn: ["man"], armed: false, bio: "Toujours partante pour un dernier verre, rarement pour le dernier métro." },
  { key: "demo-02", firstName: "Léa", gender: "woman", interestedIn: ["man"], armed: false, bio: "Je choisis le bar pour la musique, je reste pour les gens." },
  { key: "demo-03", firstName: "Inès", gender: "woman", interestedIn: ["man"], armed: true, bio: "Dis-moi ce que tu bois, je te dirai si on peut être amis." },
  { key: "demo-04", firstName: "Chloé", gender: "woman", interestedIn: ["man"], armed: true, bio: "Plutôt comptoir que banquette." },
  { key: "demo-05", firstName: "Sarah", gender: "woman", interestedIn: ["man"], armed: true, bio: "Venue avec des amies, prête à les abandonner pour une bonne discussion." },
  { key: "demo-06", firstName: "Manon", gender: "woman", interestedIn: ["man", "woman"], armed: true, bio: "Fan de quiz, mauvaise perdante, très bonne joueuse." },
  { key: "demo-07", firstName: "Jeanne", gender: "woman", interestedIn: ["man"], armed: true, bio: "Je connais toutes les paroles, je chante quand même faux." },
  { key: "demo-08", firstName: "Yasmine", gender: "woman", interestedIn: ["man"], armed: true, bio: "Si tu me fais rire, le prochain verre est pour moi." },
  { key: "demo-09", firstName: "Clémence", gender: "woman", interestedIn: ["man"], armed: true, bio: "Nouvelle dans le quartier, je cherche mes adresses." },
  { key: "demo-10", firstName: "Julia", gender: "woman", interestedIn: ["man"], armed: true, bio: "Pas de small talk, une vraie question." },
  { key: "demo-11", firstName: "Alice", gender: "woman", interestedIn: ["man"], armed: false, bio: "Ici pour la playlist, ouverte au reste." },
  { key: "demo-12", firstName: "Nour", gender: "woman", interestedIn: ["man"], armed: false, bio: "Ose venir dire bonjour, je ne mords pas." },
  // Not visible to the demo phone: room count and other viewers' feeds.
  { key: "demo-13", firstName: "Thomas", gender: "man", interestedIn: ["woman"], armed: false, bio: "Je cuisine mieux que je ne danse. Ce n'est pas difficile." },
  { key: "demo-14", firstName: "Hugo", gender: "man", interestedIn: ["woman"], armed: false, bio: "Près de la fenêtre, avec un verre de rouge et pas de plan." },
  { key: "demo-15", firstName: "Karim", gender: "man", interestedIn: ["woman"], armed: false, bio: "Bon public pour les mauvaises blagues." },
  { key: "demo-16", firstName: "Antoine", gender: "man", interestedIn: ["woman"], armed: false, bio: "Un verre, une vraie conversation, et je suis content." },
  { key: "demo-17", firstName: "Mehdi", gender: "man", interestedIn: ["woman"], armed: false, bio: "Toujours le premier arrivé, jamais le premier parti." },
  { key: "demo-18", firstName: "Lucas", gender: "man", interestedIn: ["woman"], armed: false, bio: "Je fais semblant de connaître le groupe qui passe." },
  { key: "demo-19", firstName: "Paul", gender: "man", interestedIn: ["woman", "man"], armed: false, bio: "Je cherche quelqu'un pour juger les cocktails avec moi." },
  { key: "demo-20", firstName: "Romain", gender: "man", interestedIn: ["woman"], armed: false, bio: "Au comptoir, en train d'hésiter entre deux bières." },
  { key: "demo-21", firstName: "Julien", gender: "man", interestedIn: ["man"], armed: false, bio: "Amateur de vinyles et de bars où l'on s'entend parler." },
  { key: "demo-22", firstName: "Bastien", gender: "man", interestedIn: ["man"], armed: false, bio: "Danse mal, rit fort, écoute bien." },
  { key: "demo-23", firstName: "Yanis", gender: "man", interestedIn: ["man", "nonbinary"], armed: false, bio: "Pas très doué pour aborder les gens, d'où l'appli." },
  { key: "demo-24", firstName: "Margaux", gender: "woman", interestedIn: ["woman"], armed: false, bio: "Au fond à gauche, avec la veste jaune. Tu ne peux pas me rater." },
  { key: "demo-25", firstName: "Salomé", gender: "woman", interestedIn: ["woman", "nonbinary"], armed: false, bio: "Toujours une recommandation de livre sous la main." },
  { key: "demo-26", firstName: "Lou", gender: "woman", interestedIn: ["woman"], armed: false, bio: "Je connais tous les quiz du mardi. Teste-moi." },
  { key: "demo-27", firstName: "Sacha", gender: "nonbinary", interestedIn: ["woman", "man", "nonbinary"], armed: false, bio: "Ici pour la musique, je reste pour les gens." },
  { key: "demo-28", firstName: "Alex", gender: "nonbinary", interestedIn: ["woman", "nonbinary"], armed: false, bio: "Je parle trop de mon chat. Tu es prévenu." },
];

export function validateRoster(roster) {
  const keys = new Set();
  const names = new Set();
  for (const profile of roster) {
    if (!/^demo-\d{2}$/.test(profile.key) || keys.has(profile.key)) throw new Error(`Invalid or duplicate key: ${profile.key}`);
    keys.add(profile.key);
    const name = profile.firstName;
    if (typeof name !== "string" || name !== name.trim() || [...name].length < 1 || [...name].length > 30) throw new Error(`Invalid first name for ${profile.key}`);
    // Unique names keep "like Inès" unambiguous during a pitch.
    if (names.has(name)) throw new Error(`Duplicate first name: ${name}`);
    names.add(name);
    if (typeof profile.bio !== "string" || profile.bio !== profile.bio.trim() || [...profile.bio].length > 300) throw new Error(`Invalid bio for ${profile.key}`);
    if (!genders.includes(profile.gender)) throw new Error(`Invalid gender for ${profile.key}`);
    if (!Array.isArray(profile.interestedIn) || profile.interestedIn.length < 1 || new Set(profile.interestedIn).size !== profile.interestedIn.length || !profile.interestedIn.every((value) => genders.includes(value))) {
      throw new Error(`Invalid interestedIn for ${profile.key}`);
    }
    if (typeof profile.armed !== "boolean") throw new Error(`Invalid armed flag for ${profile.key}`);
  }
  if (roster.filter((profile) => profile.armed).length > MAX_ARMED) throw new Error(`At most ${MAX_ARMED} armed profiles.`);
  return roster;
}

export function compatible(a, b) {
  return a.interestedIn.includes(b.gender) && b.interestedIn.includes(a.gender);
}

// What the founder sees, in feed order, with the armed positions marked.
export function feedFor(viewer, roster = DEMO_ROSTER) {
  return roster
    .filter((profile) => compatible(viewer, profile))
    .map((profile, index) => ({ position: index + 1, ...profile }));
}

// Arming only compatible profiles: an incompatible pre-like could never surface.
export function armedFor(viewer, roster = DEMO_ROSTER) {
  return feedFor(viewer, roster).filter((profile) => profile.armed);
}

// Staggered check-ins make the feed order deterministic and equal to roster order.
export function checkInTimes(count, now = Date.now()) {
  const start = now - 3 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, index) => new Date(start + index * 4 * 60 * 1000).toISOString());
}
