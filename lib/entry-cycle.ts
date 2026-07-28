export type EntryPresence = {
  id: string;
  left_at: string | null;
  is_visible: boolean;
};

export type EntryResolution =
  | { kind: "resume"; presence: EntryPresence }
  | { kind: "check-in" }
  | { kind: "checked-out" };

// The database history for this exact venue-night is the authority. A past
// presence means the participant deliberately left (or was checked out by
// venue operations), so returning to the URL must never silently check them in.
export function resolveEntryCycle(
  presences: EntryPresence[],
  reentryRequested: boolean
): EntryResolution {
  const activePresence = presences.find((presence) => presence.left_at === null);
  if (activePresence) return { kind: "resume", presence: activePresence };
  if (presences.length === 0 || reentryRequested) return { kind: "check-in" };
  return { kind: "checked-out" };
}
