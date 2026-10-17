// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isValidEmail } from "./input-validation.ts";
export type WaitlistEntry = { id: number; email: string; locale: "en" | "fr" | "es"; state: "waiting" | "contacted" | "closed"; created_at: string };
export function parseWaitlist(value: unknown): WaitlistEntry[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("invalid_waitlist");
  let previous = 0;
  return value.map(row => {
    if (!isRecord(row) || !Number.isSafeInteger(row.id) || Number(row.id) <= previous || !isValidEmail(row.email) ||
      typeof row.locale !== "string" || !["en", "fr", "es"].includes(row.locale) || typeof row.state !== "string" || !["waiting", "contacted", "closed"].includes(row.state) ||
      typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) throw new Error("invalid_waitlist");
    previous = Number(row.id); return row as WaitlistEntry;
  });
}
