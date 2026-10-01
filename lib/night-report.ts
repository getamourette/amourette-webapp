import type { Database, Json } from "./database.types";

export type NightReport = Database["public"]["Tables"]["venue_night_reports"]["Row"];
export type GenderActivity = {
  gender: "woman" | "man" | "nonbinary";
  participants: number;
  sent: number;
  received: number;
  senders: number;
  receivers: number;
};
export type AttendanceBucket = { at: string; count: number };

function object(value: Json): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function count(value: Json | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function genderActivity(value: Json): GenderActivity[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const rows: GenderActivity[] = [];
  for (const row of value) {
    if (!object(row) || !["woman", "man", "nonbinary"].includes(String(row.gender))) return null;
    const { participants, sent, received, senders, receivers } = row;
    if (!count(participants) || !count(sent) || !count(received) || !count(senders) || !count(receivers)) return null;
    if (senders > participants || receivers > participants) return null;
    const gender = row.gender as GenderActivity["gender"];
    if (rows.some((entry) => entry.gender === gender)) return null;
    rows.push({ gender, participants, sent, received, senders, receivers });
  }
  return rows;
}
export function attendanceBuckets(value: Json): AttendanceBucket[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AttendanceBucket[] = [];
  for (const row of value) {
    if (!object(row) || typeof row.at !== "string" || !Number.isFinite(Date.parse(row.at)) || !count(row.count)) return null;
    rows.push({ at: row.at, count: row.count });
  }
  return rows;
}
export function reportNumber(value: number | null | undefined): string {
  return value == null ? "Not available" : value.toLocaleString();
}
export function reportRate(value: number | null, total: number | null): string {
  if (value === null || total === null) return "Not available";
  return total === 0 ? "—" : `${Math.round(value / total * 100)}% (${value}/${total})`;
}

export function reportAverage(value: number, total: number): string {
  return total === 0 ? "—" : (value / total).toFixed(1);
}
