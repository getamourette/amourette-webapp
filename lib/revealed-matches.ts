// Match reveals this browser has already shown, per participant (#479). A match
// that lands while the room is off screen (another page, a locked phone, a tab
// the browser discarded) is revealed the next time the room loads, and only
// once. Matches expire with the night, so the list stays short; it is capped
// anyway and holds nothing but opaque match ids.
const KEY_PREFIX = "amourette-revealed-matches:";
const MAX_IDS = 200;
const MAX_RAW_LENGTH = MAX_IDS * 40;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids already revealed, or null when browser storage cannot be read. */
export function readRevealedMatches(userId: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY_PREFIX + userId);
  } catch {
    return null;
  }
  // A malformed value is dropped: its reveals may show once more, then it is rewritten.
  if (raw === null || raw.length > MAX_RAW_LENGTH) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && uuid.test(id)).slice(-MAX_IDS));
  } catch {
    return new Set();
  }
}

/** Records the revealed ids, keeping the most recent ones within the cap. */
export function storeRevealedMatches(userId: string, ids: Iterable<string>) {
  if (typeof window === "undefined") return;
  try {
    const kept = [...ids].filter(id => uuid.test(id)).slice(-MAX_IDS);
    window.localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(kept));
  } catch {
    /* Unavailable storage only means a reveal may show again after a reload. */
  }
}
