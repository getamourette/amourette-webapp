import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptDiagnostics, decryptDiagnostics } from "./e2e-artifacts.mjs";

const key = randomBytes(32).toString("hex");
const diagnostic = Buffer.from("private browser session and screenshot bytes\0\xff");
const encrypted = encryptDiagnostics(diagnostic, key);
assert.deepEqual(decryptDiagnostics(encrypted, key), diagnostic);
assert.equal(encrypted.includes(diagnostic), false);
assert.notDeepEqual(encryptDiagnostics(diagnostic, key), encrypted, "archives use fresh nonces");
assert.throws(() => decryptDiagnostics(encrypted, randomBytes(32).toString("hex")));
for (const offset of [0, 8, 20, 36]) {
  const tampered = Buffer.from(encrypted);
  tampered[offset] ^= 1;
  assert.throws(() => decryptDiagnostics(tampered, key), "tampered archives cannot be read");
}
assert.throws(() => decryptDiagnostics(encrypted.subarray(0, 30), key));
assert.throws(() => encryptDiagnostics(diagnostic, ""));
console.log("E2E diagnostic encryption regressions passed.");
