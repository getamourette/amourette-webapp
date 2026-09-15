// Empty live-room decisions (#118), kept out of the room component so they can
// be exercised without a browser (see scripts/test-empty-room-states.mts).
//
// Why a feed can be empty while the night is live: nobody has arrived yet,
// everyone present is outside your preferences, they are all already matches of
// yours, you blocked them (or they blocked you), or they are checked in
// invisible. The last three are indistinguishable from here on purpose — RLS
// strips those rows before the client ever sees them — and none of them may
// ever be named on screen, because naming one would tell someone they were
// passed over. What the participant can act on is identical in every case, so
// the only thing that varies is how honestly we frame the room itself.

export type EmptyRoomVariant = "alone" | "emptied" | "live";

// Note what this can and cannot know: `roomCount` is an instantaneous count and
// `roomHadCrowd` only remembers what happened since this page loaded. So `alone`
// means "nobody but you is here right now", never "you are the first one
// tonight" — people may have come and gone before the scan, and the copy must
// not claim a history we cannot see.
export function emptyRoomVariant({
  roomCount,
  roomHadCrowd,
}: {
  // People checked in right now (invisible ones included, us included), or null
  // when the aggregate could not be read.
  roomCount: number | null;
  // The room held more than just us at some point tonight.
  roomHadCrowd: boolean;
}): EmptyRoomVariant {
  // An unreadable count must not turn into a claim about the room: fall back to
  // the variant whose copy asserts nothing about who is here.
  if (roomCount === null) return "live";
  if (roomCount > 1) return "live";
  return roomHadCrowd ? "emptied" : "alone";
}

export type FeedTransition = "arrival" | "drained" | "none";

// How the feed changed between two renders. "arrival" cues the new profile
// without moving the feed under the thumb; "drained" lets the empty room
// acknowledge that what was on screen just went away, instead of appearing out
// of nowhere. The very first fill (no previous feed) is neither: that is the
// room loading, not something changing under the participant.
export function feedTransition(
  previousIds: readonly string[],
  nextIds: readonly string[]
): FeedTransition {
  if (previousIds.length === 0) return "none";
  if (nextIds.length === 0) return "drained";
  return nextIds.some((id) => !previousIds.includes(id)) ? "arrival" : "none";
}
