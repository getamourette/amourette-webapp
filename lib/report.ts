// Shared participant report helpers (#482): the server refusals every report
// form maps the same way, and the people a guest may report from tonight.
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isUuid } from "./input-validation.ts";

export const REPORT_REASONS = [
  "harassment",
  "fake_profile",
  "underage",
  "unsafe_behavior",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// "already" is a success for the guest: the founders already have her case
// (one report per person per night, `submit_report` unique index).
export type ReportOutcome = "sent" | "already" | "note_required" | "not_eligible" | "failed";

export function reportOutcome(error: { message?: string | null } | null | undefined): ReportOutcome {
  if (!error) return "sent";
  const message = error.message ?? "";
  if (message.includes("already reported this person")) return "already";
  if (message.includes("note is required for other reports")) return "note_required";
  if (message.includes("only report users")) return "not_eligible";
  return "failed";
}

// People this guest has seen tonight on this device (feed, matches, chat), so
// she can still report someone after a block, a departure or a hidden profile
// removed them from her screen. The server (`submit_report`) stays the only
// authority on who may be reported; this list only offers names she already saw.
export type SeenPerson = { id: string; first_name: string | null; photo_url: string | null };

const SEEN_PREFIX = "amourette-seen-tonight";
export const SEEN_MAX_PEOPLE = 100;
const SEEN_MAX_RAW = 64_000;
const NAME_MAX = 200;
const PHOTO_MAX = 1_024;

export function seenTonightKey(meId: string, nightId: string) {
  return `${SEEN_PREFIX}:${meId}:${nightId}`;
}

function isSeenPerson(value: unknown): value is SeenPerson {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return isUuid(row.id) &&
    (row.first_name === null || (typeof row.first_name === "string" && row.first_name.length <= NAME_MAX)) &&
    (row.photo_url === null || (typeof row.photo_url === "string" && row.photo_url.length <= PHOTO_MAX));
}

// Malformed, oversized or foreign records read as an empty list.
export function parseSeenTonight(raw: string | null): SeenPerson[] {
  if (!raw || raw.length > SEEN_MAX_RAW) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const people: SeenPerson[] = [];
    for (const row of value.slice(0, SEEN_MAX_PEOPLE)) {
      if (!isSeenPerson(row) || seen.has(row.id)) continue;
      seen.add(row.id);
      people.push({ id: row.id, first_name: row.first_name, photo_url: row.photo_url });
    }
    return people;
  } catch {
    return [];
  }
}

// Most recently seen first; a known person keeps their latest name and photo.
export function mergeSeenTonight(current: SeenPerson[], people: SeenPerson[], meId: string): SeenPerson[] {
  const fresh = people.filter((person) => isSeenPerson(person) && person.id !== meId)
    .map(({ id, first_name, photo_url }) => ({ id, first_name, photo_url }));
  const ids = new Set(fresh.map((person) => person.id));
  const unique = fresh.filter((person, index) => fresh.findIndex((other) => other.id === person.id) === index);
  return [...unique, ...current.filter((person) => !ids.has(person.id))].slice(0, SEEN_MAX_PEOPLE);
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

// The storage getter itself can throw (blocked site data), so it is read inside the guard.
const browserStore = (): Store => window.localStorage;

export function readSeenTonight(meId: string, nightId: string, storage: () => Store = browserStore): SeenPerson[] {
  try { return parseSeenTonight(storage().getItem(seenTonightKey(meId, nightId))); } catch { return []; }
}

// Only the current guest's current night is kept on the device.
export function rememberSeenTonight(meId: string, nightId: string, people: SeenPerson[], storage: () => Store = browserStore) {
  if (!isUuid(meId) || !isUuid(nightId) || people.length === 0) return;
  try {
    const store = storage();
    const key = seenTonightKey(meId, nightId);
    const current = parseSeenTonight(store.getItem(key));
    const next = mergeSeenTonight(current, people, meId);
    if (next.length === current.length && next.every((person, index) =>
      person.id === current[index].id && person.first_name === current[index].first_name && person.photo_url === current[index].photo_url)) return;
    for (let index = store.length - 1; index >= 0; index--) {
      const other = store.key(index);
      if (other?.startsWith(`${SEEN_PREFIX}:`) && other !== key) store.removeItem(other);
    }
    store.setItem(key, JSON.stringify(next));
  } catch {
    // Storage can be disabled; the list then only holds who is on screen now.
  }
}
