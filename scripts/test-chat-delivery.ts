import assert from "node:assert/strict";
// @ts-expect-error -- executed by node --experimental-strip-types, not bundled.
import { failUnconfirmedMessage, mergeMessages, optimisticMessage, restoreStoredMessages, setDeliveryState, unconfirmedMessages, type ServerMessage } from "../lib/chat-delivery.ts";
// @ts-expect-error -- executed by node --experimental-strip-types, not bundled.
import { chatReadMarkerKey, countUnreadByMatch, latestMessageTimestamp, legacyChatReadMarkerKey } from "../lib/chat-read-state.ts";

const row = (id: string, created_at = "2026-08-02T10:00:00.000Z"): ServerMessage => ({
  id,
  match_id: "match",
  sender_id: "me",
  body: id,
  created_at,
});

const first = optimisticMessage("b", "match", "me", "hello", "2026-08-02T10:00:02.000Z");
assert.equal(first.deliveryState, "pending", "optimistic messages render pending immediately");

let messages = [first, optimisticMessage("c", "match", "me", "again", "2026-08-02T10:00:03.000Z")];
messages = mergeMessages(messages, [row("b")]);
messages = mergeMessages(messages, [row("b")]);
assert.deepEqual(messages.map(({ id, deliveryState }) => [id, deliveryState]), [["b", "confirmed"], ["c", "pending"]]);

messages = mergeMessages(messages, [row("c")]);
assert.equal(messages.length, 2, "response and Realtime converge regardless of order");
assert.deepEqual(mergeMessages([], [row("z"), row("a")]).map((message) => message.id), ["a", "z"], "ties use id order");

const pending = optimisticMessage("pending", "match", "me", "pending", "2026-08-02T10:00:04.000Z");
const withIncoming = mergeMessages([pending], [{ ...row("incoming"), sender_id: "other" }]);
assert.deepEqual(withIncoming.map((message) => message.id), ["pending", "incoming"]);
assert.deepEqual(mergeMessages(withIncoming, [row("pending")]).map((message) => message.id), ["pending", "incoming"], "confirmation preserves position");

const failed = setDeliveryState([pending], "pending", "failed");
assert.equal(failed[0].deliveryState, "failed", "timeout and errors can fail one message");
const retrying = setDeliveryState(failed, "pending", "pending");
assert.equal(retrying[0].id, pending.id, "manual retry preserves id");
assert.equal(mergeMessages(retrying, [row("pending")])[0].deliveryState, "confirmed", "late success wins permanently");
const confirmedBeforeStaleTimeout = mergeMessages([pending], [row("pending")]);
assert.equal(
  failUnconfirmedMessage(confirmedBeforeStaleTimeout, "pending")[0].deliveryState,
  "confirmed",
  "a stale timeout cannot downgrade a confirmed message"
);

const stored = unconfirmedMessages([pending, mergeMessages([], [row("done")])[0]]);
assert.deepEqual(stored.map((message) => message.id), ["pending"], "only unresolved messages persist");
assert.equal(restoreStoredMessages(stored, [row("pending")])[0].deliveryState, "confirmed");
assert.equal(restoreStoredMessages(stored, [])[0].deliveryState, "failed");
assert.deepEqual(
  restoreStoredMessages(
    [{ ...stored[0], created_at: "2026-08-02T10:00:02.000Z" }],
    [row("earlier", "2026-08-02T10:00:01.000Z")]
  ).map((message) => message.id),
  ["earlier", "pending"],
  "refresh restores server order"
);

assert.equal(chatReadMarkerKey("match"), "amourette-chat-read:match");
assert.equal(legacyChatReadMarkerKey("match"), "paramour-chat-read:match");
assert.equal(latestMessageTimestamp([row("one", "2026-08-02T10:00:00Z"), row("two", "2026-08-02T10:01:00Z")]), "2026-08-02T10:01:00Z");
assert.deepEqual(
  countUnreadByMatch(
    [
      row("old", "2026-08-02T10:00:00Z"),
      { ...row("new", "2026-08-02T10:02:00Z"), sender_id: "other" },
      { ...row("isolated", "2026-08-02T10:03:00Z"), match_id: "second", sender_id: "other" },
    ],
    "me",
    { match: "2026-08-02T10:01:00Z" },
  ),
  { match: 1, second: 1 },
  "unread markers accumulate and remain isolated per match",
);

console.log("chat delivery tests passed");
