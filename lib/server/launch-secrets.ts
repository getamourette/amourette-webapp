import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

export type LaunchCredential = { id: string; management: string; arrival: string; issued: number };
function encryptionKey(): Buffer {
  const value = process.env.LAUNCH_SECRET_KEY;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new Error("launch_key_unconfigured");
  return Buffer.from(value, "hex");
}

// Purpose-bound authenticated encryption. Key rotation requires an explicit
// re-encryption migration; delivery ciphertext outlives browser access.
export function sealCredential(value: LaunchCredential, purpose: "access" | "delivery"): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(`launch:v1:${purpose}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return `v1.${Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}
export function openCredential(token: unknown, purpose: "access" | "delivery", now = Date.now()): LaunchCredential {
  if (typeof token !== "string" || !/^v1\.[A-Za-z0-9_-]{100,1500}$/.test(token)) throw new Error("invalid_access");
  const bytes = Buffer.from(token.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(`launch:v1:${purpose}`));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const value: unknown = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
  if (!value || typeof value !== "object") throw new Error("invalid_access");
  const v = value as LaunchCredential;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.id) || !/^[a-f0-9]{64}$/.test(v.management) ||
    !/^[a-f0-9]{64}$/.test(v.arrival) || v.arrival === v.management || !Number.isSafeInteger(v.issued) ||
    (purpose === "access" && (v.issued > now || now - v.issued >= 7 * 86400000))) throw new Error("invalid_access");
  return v;
}
export function issueCredential(): { id: string; access: string } {
  const value = { id: randomUUID(), management: randomBytes(32).toString("hex"), arrival: randomBytes(32).toString("hex"), issued: Date.now() };
  return { id: value.id, access: sealCredential(value, "access") };
}
