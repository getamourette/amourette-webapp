// Empty live-room regression (#118). Covers the decisions the client makes on
// its own: which empty room to show, and how the feed filling or draining is
// acknowledged. The server-side half (a block or an invisible participant
// removing rows before the client sees them) is enforced by RLS and covered by
// the multi-user `npm run test:venue-nights`; from here, those cases are
// indistinguishable from an empty feed by design, which is what this asserts.

import assert from "node:assert/strict";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { emptyRoomVariant, feedTransition } from "../lib/empty-room.ts";

// Initial load, nobody else checked in: the room is genuinely still filling.
assert.equal(
  emptyRoomVariant({ roomCount: 1, roomHadCrowd: false }),
  "alone",
  "alone on arrival"
);
assert.equal(
  emptyRoomVariant({ roomCount: 0, roomHadCrowd: false }),
  "alone",
  "a zero count is still nobody but us"
);

// People are here and the feed is empty anyway: preferences, a block, or an
// invisible participant. All three land on the same screen, which never says
// which one it is.
assert.equal(
  emptyRoomVariant({ roomCount: 8, roomHadCrowd: true }),
  "live",
  "a busy room never claims to be filling up"
);
assert.equal(
  emptyRoomVariant({ roomCount: 2, roomHadCrowd: false }),
  "live",
  "someone else is here even if we never saw a crowd"
);

// The room drained back to us: promising a fill-up right after watching
// everyone leave would ring false.
assert.equal(
  emptyRoomVariant({ roomCount: 1, roomHadCrowd: true }),
  "emptied",
  "emptied after a crowd"
);

// An unreadable aggregate must not become a claim about who is in the room.
assert.equal(
  emptyRoomVariant({ roomCount: null, roomHadCrowd: false }),
  "live",
  "an unknown count asserts nothing"
);

// Empty to populated: the first fill is the room loading, not something moving
// under the thumb, so it is not cued as an arrival.
assert.equal(feedTransition([], ["a"]), "none", "initial load is not an arrival");
assert.equal(feedTransition(["a"], ["a", "b"]), "arrival", "someone joins the feed");
assert.equal(
  feedTransition(["a"], ["a"]),
  "none",
  "a refetch that changes nothing is silent"
);
assert.equal(
  feedTransition(["a", "b"], ["b"]),
  "none",
  "losing one of several is absorbed by the feed"
);

// Populated to empty, whether the last profile left, blocked us, or became a
// match: the empty room says so instead of appearing out of nowhere.
assert.equal(feedTransition(["a"], []), "drained", "last profile leaves");
assert.equal(feedTransition(["a", "b"], []), "drained", "the room empties at once");
assert.equal(feedTransition([], []), "none", "still empty is not a transition");

process.stdout.write("Empty live-room state regression passed.\n");
