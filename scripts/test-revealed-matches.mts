import assert from "node:assert/strict";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { readRevealedMatches, storeRevealedMatches } from "../lib/revealed-matches.ts";

const store = new Map<string, string>();
let broken = false;
const storage = {
  getItem: (key: string) => { if (broken) throw new Error("denied"); return store.get(key) ?? null; },
  setItem: (key: string, value: string) => { if (broken) throw new Error("denied"); store.set(key, value); },
};
Object.assign(globalThis, { window: { localStorage: storage } });

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = "amourette-revealed-matches:me";

assert.deepEqual(readRevealedMatches("me"), new Set(), "nothing stored: every current match is still to reveal");
storeRevealedMatches("me", [id(1), id(2)]);
assert.deepEqual(readRevealedMatches("me"), new Set([id(1), id(2)]));
assert.deepEqual(readRevealedMatches("someone-else"), new Set(), "reveals are kept per participant");

store.set(key, JSON.stringify([id(3), 7, "not-a-uuid", null]));
assert.deepEqual(readRevealedMatches("me"), new Set([id(3)]), "only canonical UUID strings are kept");
for (const raw of ["{", '{"a":1}', '"x"', "x".repeat(10_000)]) {
  store.set(key, raw);
  assert.deepEqual(readRevealedMatches("me"), new Set(), `malformed or oversized value ${raw.slice(0, 12)} is ignored`);
}

storeRevealedMatches("me", Array.from({ length: 250 }, (_, n) => id(n)));
const kept = readRevealedMatches("me");
assert.equal(kept?.size, 200, "the list is capped");
assert.ok(kept?.has(id(249)) && !kept?.has(id(0)), "the most recent ids are kept");

broken = true;
assert.equal(readRevealedMatches("me"), null, "unreadable storage is reported, never taken as empty");
assert.doesNotThrow(() => storeRevealedMatches("me", [id(1)]));
console.log("revealed matches: ok");
