import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAGIC = Buffer.from("AMOUE2E1");

function parseKey(value) {
  if (!/^[a-f0-9]{64}$/i.test(value ?? "")) {
    throw new Error("E2E_ARTIFACT_KEY must be a 32-byte hexadecimal key; see docs/workflow.md");
  }
  return Buffer.from(value, "hex");
}

export function encryptDiagnostics(archive, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseKey(key), nonce);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptDiagnostics(encrypted, key) {
  if (encrypted.length < 36 || !encrypted.subarray(0, 8).equals(MAGIC)) {
    throw new Error("Invalid E2E diagnostic archive");
  }
  const decipher = createDecipheriv("aes-256-gcm", parseKey(key), encrypted.subarray(8, 20));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(encrypted.subarray(20, 36));
  // Authenticate the entire archive before writing any plaintext to disk.
  return Buffer.concat([decipher.update(encrypted.subarray(36)), decipher.final()]);
}

function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const [mode, input, output] = process.argv.slice(2);
  if (mode === "encrypt") {
    const paths = ["playwright-report", "test-results"].filter((path) => existsSync(path));
    if (!paths.length) {
      console.log("No browser diagnostics were produced.");
      return;
    }
    parseKey(process.env.E2E_ARTIFACT_KEY);
    const archive = execFileSync("tar", ["-czf", "-", ...paths], { maxBuffer: 256 * 1024 * 1024 });
    writeFileSync("e2e-diagnostics.enc", encryptDiagnostics(archive, process.env.E2E_ARTIFACT_KEY), { mode: 0o600 });
    console.log("Encrypted browser diagnostics ready for upload.");
  } else if (mode === "decrypt" && input && output) {
    const archive = decryptDiagnostics(readFileSync(input), process.env.E2E_ARTIFACT_KEY);
    writeFileSync(output, archive, { mode: 0o600, flag: "wx" });
    console.log("Diagnostics decrypted. Extract locally; do not publish the contents.");
  } else {
    throw new Error("Usage: node scripts/e2e-artifacts.mjs encrypt | decrypt <input.enc> <output.tar.gz>");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
