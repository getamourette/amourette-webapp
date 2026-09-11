// Maintained with docs/reports/input-validation-audit.md and the SQL contract.
// ECMAScript WhiteSpace + LineTerminator. No NFC conversion or internal folding.
export const BOUNDARY_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
export const TEXT_RAW_MAX_BYTES = 16 * 1024;
export const MESSAGE_MAX_LENGTH = 2000;
export const SAFETY_NOTE_MAX_LENGTH = 500;
export const VENUE_NAME_MAX_LENGTH = 120;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidText(value: unknown, max: number, required = true): value is string {
  if (typeof value !== "string" || value.length > TEXT_RAW_MAX_BYTES ||
      new TextEncoder().encode(value).byteLength > TEXT_RAW_MAX_BYTES) return false;
  // PostgreSQL text cannot represent NUL or unpaired UTF-16 surrogates.
  if (/[\u0000\uD800-\uDFFF]/u.test(value)) return false;
  const length = Array.from(value.trim()).length;
  return length <= max && (!required || length > 0);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isVenueSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value);
}

// A generated URL must not force shortening or transliterating the venue's name.
export function createVenueSlug(name: string): string {
  const stem = name.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (stem && stem.length <= 80) return stem;
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${stem.slice(0, 71).replace(/-+$/, "") || "venue"}-${suffix}`;
}

export function isLaunchThreshold(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

export function isUnsubscribeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string" || !isValidText(value, 254)) return false;
  const trimmed = value.trim();
  if (!/^[\x21-\x7e]+$/.test(trimmed)) return false;
  const email = normalizeEmail(trimmed);
  if (email.length > 254) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  ) && !/^[0-9]+$/.test(labels[labels.length - 1]);
}
