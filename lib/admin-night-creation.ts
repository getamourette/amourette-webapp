// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { launchFollowsEntry, registrationClosesAt } from "./admin-dashboard.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isLaunchThreshold } from "./input-validation.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { formatWorkspaceDate, isWorkspaceId } from "./admin-venue-workspace.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { resolveVenueLocalDateTime } from "./venue-time.ts";

export type ScheduleDraft = { date: string; entry: string; launch: string; close: string; threshold: number };
export type OverlapNight = { id: string; venue_id: string; waiting_opens_at: string; closes_at: string };
export function closingLocal(date: string, launch: string, close: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !launch || !close) return "";
  if (close > launch) return `${date}T${close}`;
  const nextDay = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(nextDay.getTime())) return "";
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return `${nextDay.toISOString().slice(0, 10)}T${close}`;
}

export function validateNightSchedule(draft: ScheduleDraft, zone: string, venueId: string, nights: OverlapNight[], nightId: string | null = null) {
  const errors: Partial<Record<keyof ScheduleDraft, string>> = {};
  const closes = closingLocal(draft.date, draft.launch, draft.close);
  const resolved = [draft.date && draft.entry ? `${draft.date}T${draft.entry}` : "", draft.date && draft.launch ? `${draft.date}T${draft.launch}` : "", closes].map(value => resolveVenueLocalDateTime(value, zone));
  const hasValidLaunchOrder = launchFollowsEntry(draft.date, draft.entry, draft.launch);
  const instants = hasValidLaunchOrder && resolved.every(item => item.ok) ? resolved.map(item => item.ok ? item.iso : "") : null;
  const overlappingNight = instants ? nights.find(night => night.venue_id === venueId && night.id !== nightId && night.waiting_opens_at < instants[2] && instants[0] < night.closes_at) : undefined;
  if (!draft.date) errors.date = "Choose a night date.";
  const fields = ["entry", "launch", "close"] as const;
  resolved.forEach((item, index) => { if (!item.ok) errors[fields[index]] = item.message; });
  if (!hasValidLaunchOrder) errors.launch = "Guaranteed launch must be later than entry on the same venue-local date.";
  if (overlappingNight) errors.date = "This overlaps another scheduled night for this venue.";
  if (!isLaunchThreshold(draft.threshold)) errors.threshold = "Launch threshold must be an integer from 1 to 2147483647.";
  return { errors, closes, resolved, instants, overlappingNight, hasValidLaunchOrder };
}

export function preselectedVenue(value: unknown, ids: string[]) {
  return isWorkspaceId(value) && ids.includes(value) ? value : "";
}

export function creationSummary(draft: ScheduleDraft, zone: string, reservations: { capacity: string; amount: string; currency: string; opens: string } | null, now = Date.now()) {
  const close = closingLocal(draft.date, draft.launch, draft.close);
  const entry = resolveVenueLocalDateTime(`${draft.date}T${draft.entry}`, zone);
  const date = resolveVenueLocalDateTime(`${draft.date}T12:00`, zone);
  const closingDate = close ? resolveVenueLocalDateTime(`${close.slice(0, 10)}T12:00`, zone) : null;
  const opening = reservations ? resolveVenueLocalDateTime(reservations.opens, zone) : null;
  const cutoff = entry.ok ? formatWorkspaceDate(registrationClosesAt(entry.iso), zone, now, true) : "Choose entry time";
  return {
    date: date.ok ? formatWorkspaceDate(date.iso, zone, now) : "Choose a date",
    closingDate: closingDate?.ok ? formatWorkspaceDate(closingDate.iso, zone, now) : "",
    hours: `Entry ${draft.entry || "—"} → matching by ${draft.launch || "—"} → closes ${draft.close || "—"}${close && close.slice(0, 10) !== draft.date ? " (next day)" : ""}`,
    entry: reservations ? `${reservations.capacity || "—"} places · ${reservations.currency.toUpperCase()} ${reservations.amount || "—"} deposit` : "Walk-in only",
    registration: reservations ? `Registration ${opening?.ok ? formatWorkspaceDate(opening.iso, zone, now, true) : "Choose opening time"} → ${cutoff}` : "The venue QR opens the room.",
  };
}

// These query parameters are informational only, never evidence of server state.
export function creationNotice(scheduled: string | null, reason: string | null) {
  if (scheduled !== "1") return null;
  const boundedReason = reason?.trim();
  return boundedReason && [...boundedReason].length <= 1000
    ? { partial: true, message: `Night scheduled, but reservations were not set up: ${boundedReason}. Set them up from Reservations & deposits.` }
    : { partial: false, message: "Night scheduled." };
}
