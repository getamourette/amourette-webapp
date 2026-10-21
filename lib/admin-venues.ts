// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { groupWorkspaceNights, workspaceNightStatus, workspaceNightTiming, type WorkspaceNight } from "./admin-venue-workspace.ts";

export const LOCATIONS = [
  { city: "Paris", timezone: "Europe/Paris" },
  { city: "New York", timezone: "America/New_York" },
] as const;

export function parseVenueCity(value: unknown) {
  return LOCATIONS.find(location => location.city === value)?.city ?? null;
}

export function venueCardSummary<T extends WorkspaceNight>(nights: T[], timezone: string, now: number) {
  const groups = groupWorkspaceNights(nights, now);
  const active = groups.active.find(night => workspaceNightStatus(night, now) === "Live") ?? groups.active[0];
  const next = groups.upcoming[0];
  const status = active ? workspaceNightStatus(active, now) : next ? "Scheduled" : "Ended";
  const timing = next ? workspaceNightTiming(next, timezone, now) : null;
  const held = groups.history.filter(night => night.terminal_reason !== "cancelled").length;
  return {
    status,
    label: active ? status === "Live" ? "Live now" : status : next ? `Next: ${timing!.date}` : "No upcoming night",
    secondary: timing ? `${timing.date} · ${timing.hours}` : `${held} ${held === 1 ? "night" : "nights"} held`,
  };
}
