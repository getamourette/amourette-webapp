import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySvixSignature(
  payload: string,
  id: string,
  timestamp: string,
  signatures: string,
  secret: string,
  nowMs = Date.now()
) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(nowMs / 1000 - seconds) > 300) return false;
  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try { key = Buffer.from(encodedSecret, "base64"); } catch { return false; }
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  return signatures.split(" ").some((entry) => {
    const encoded = entry.startsWith("v1,") ? entry.slice(3) : "";
    try {
      const actual = Buffer.from(encoded, "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch { return false; }
  });
}
