// Like-retention copy (#483, Z2-I4). Pausing the room, leaving the night and
// hiding a profile delete every like that is not mutual (decision #231,
// enforced by `private.invalidate_like_pairs` and covered by
// `test-like-sql.mjs`). Matches and conversations survive until the end of the
// night. This pins every surface that explains it against the old promise that
// likes are kept, so the copy cannot drift back to it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { t, SUPPORTED_LOCALES } from "../lib/strings.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A sentence that names likes and says they are kept, preserved or survive a pause.
const keptLikes = [
  /\blikes?\b[^.]*\b(kept|preserved|not deleted|does not delete|retained)\b/i,
  /\bJ’aime\b[^.]*\b(conservés|préservés)\b/i,
  /\blikes\b[^.]*\b(conservés|ne les supprime pas)\b/i,
  /«Me gusta»[^.]*\bse conservan\b/i,
  /\blikes\b[^.]*\b(se conservan|no los elimina)\b/i,
  /Existing interactions are preserved/i,
];

function assertNoKeptLikes(label: string, text: string) {
  for (const pattern of keptLikes) {
    const hit = text.match(pattern);
    assert.equal(hit, null, `${label} still says likes are kept: "${hit?.[0]}"`);
  }
}

// Guest copy: the leave confirmation, the screen after leaving and the hidden
// profile screen each say that unmatched likes are cleared.
const cleared: Record<string, RegExp> = {
  en: /likes that (aren’t|weren’t) mutual (are|have been) cleared/i,
  fr: /J’aime non réciproques (sont|ont été) effacés/i,
  es: /«Me gusta» no correspondidos (se borran|se han borrado)/i,
};
for (const locale of SUPPORTED_LOCALES) {
  const room = t[locale].room;
  for (const key of ["leavePreserved", "departedBody", "invisibleBody"] as const) {
    const text: string = room[key];
    assertNoKeptLikes(`${locale}.room.${key}`, text);
    assert.match(text, cleared[locale], `${locale}.room.${key} must say unmatched likes are cleared`);
  }
}

// Terms, privacy policy and the founder pause controls.
for (const path of ["lib/legal-content.ts", "lib/privacy-policy.ts", "app/admin/RoomActions.tsx"]) {
  assertNoKeptLikes(path, read(path));
}
for (const [path, count] of [["lib/legal-content.ts", 3], ["lib/privacy-policy.ts", 3]] as const) {
  const source = read(path);
  const earlier = source.match(/(Likes that are not mutual are deleted earlier|likes non réciproques sont supprimés plus tôt|likes no correspondidos se eliminan antes)/g) ?? [];
  assert.equal(earlier.length, count, `${path} must say in every language that unmatched likes are deleted on pause, leave or hide`);
}
const roomActions = read("app/admin/RoomActions.tsx");
assert.match(roomActions, /close: "Pause the room\.[^"]*like[^"]*not mutual is cleared/, "the founder pause confirmation must warn that unmatched likes are cleared");

// The detector itself: each old sentence is still caught.
for (const old of [
  "Your likes, matches and conversations are kept until the night ends.",
  "Tes J’aime, matchs et conversations sont conservés jusqu’à la fin de la soirée.",
  "Tus «Me gusta», matches y conversaciones se conservan hasta el final de la noche.",
  "Likes, matches and conversations are deleted at the definitive end of the night; a temporary pause does not delete them.",
  "Les likes, matchs et conversations sont supprimés à la fin définitive de la soirée ; une pause temporaire ne les supprime pas.",
  "Pause the room. Existing interactions are preserved.",
]) {
  assert.throws(() => assertNoKeptLikes("detector", old), /still says likes are kept/, `detector misses: ${old}`);
}

console.log("Like-retention copy: guest, legal and founder surfaces say unmatched likes are cleared.");
