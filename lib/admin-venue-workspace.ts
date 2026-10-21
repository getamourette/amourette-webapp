export type WorkspaceNight = {
  waiting_opens_at: string;
  closes_at: string;
  opened_at: string | null;
  terminal_at: string | null;
  terminal_reason: string | null;
  status: string;
};

export function isTerminalNight(night: WorkspaceNight, now = Date.now()) {
  return Boolean(night.terminal_at || Date.parse(night.closes_at) <= now);
}

export function isNightScheduleLocked(night: WorkspaceNight, now = Date.now()) {
  return isTerminalNight(night, now) || Boolean(night.opened_at) ||
    Date.parse(night.waiting_opens_at) <= now || ["waiting", "live"].includes(night.status);
}

export function workspaceNightStatus(night: WorkspaceNight, now: number) {
  if (night.terminal_reason === "cancelled") return "Cancelled";
  if (isTerminalNight(night, now)) return "Ended";
  if (night.status === "live") return "Live";
  if (night.status === "waiting") return "Waiting";
  if (night.opened_at) return "Paused";
  if (Date.parse(night.waiting_opens_at) <= now) return "Opening";
  return "Scheduled";
}

export function groupWorkspaceNights<T extends WorkspaceNight>(nights: T[], now: number) {
  const active: T[] = [];
  const upcoming: T[] = [];
  const history: T[] = [];
  for (const night of nights) {
    if (isTerminalNight(night, now)) history.push(night);
    else if (isNightScheduleLocked(night, now)) active.push(night);
    else upcoming.push(night);
  }
  active.sort((a, b) => a.waiting_opens_at.localeCompare(b.waiting_opens_at));
  upcoming.sort((a, b) => a.waiting_opens_at.localeCompare(b.waiting_opens_at));
  history.sort((a, b) => b.waiting_opens_at.localeCompare(a.waiting_opens_at));
  return { active, upcoming, history };
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export function parseNightsHomeFilters(view: string | null, venue: string | null, venueIds: readonly string[]) {
  return {
    view: view === "past" ? "past" as const : "upcoming" as const,
    venueId: isWorkspaceId(venue) && venueIds.includes(venue) ? venue : null,
  };
}

// Use the venue's calendar year for both the header and detailed timestamps.
export function formatWorkspaceDate(instant: string, timeZone: string, now: number, includeTime = false) {
  const year = new Intl.DateTimeFormat("en", { timeZone, year: "numeric" });
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", day: "numeric", month: "short",
    year: year.format(new Date(instant)) === year.format(new Date(now)) ? undefined : "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  }).format(new Date(instant));
}

export function workspaceNightTiming(night: WorkspaceNight, timeZone: string, now: number) {
  const calendarDate = (instant: string | number) => new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(instant));
  const time = (instant: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(instant));
  // Compare calendar days in the venue's timezone, including DST transitions.
  const entryDate = calendarDate(night.waiting_opens_at);
  const currentDate = calendarDate(now);
  const days = Math.round((Date.parse(entryDate) - Date.parse(currentDate)) / 86_400_000);
  const closeDays = Math.round((Date.parse(calendarDate(night.closes_at)) - Date.parse(entryDate)) / 86_400_000);
  const closing = `${time(night.closes_at)}${closeDays > 0 ? ` (+${closeDays} ${closeDays === 1 ? "day" : "days"})` : ""}`;
  return {
    date: formatWorkspaceDate(night.waiting_opens_at, timeZone, now),
    relative: days === 0 ? "Today" : new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day"),
    hours: `${time(night.waiting_opens_at)} → ${closing}`,
    closing,
  };
}


// Route decisions must happen before the client shell can send its loading HTML.
export function adminWorkspaceRouteResponse(pathname: string): { status: 404 } | { status: 308; location: string } | null {
  if (/^\/admin\/(?:nights|venues)\/new\/?$/.test(pathname)) return null;
  const legacy = /^\/admin\/venues\/([^/]+)\/nights\/([^/]+)\/?$/.exec(pathname);
  const detail = /^\/admin\/(?:venues|nights)\/([^/]+)\/?$/.exec(pathname);
  if (!legacy && !detail) return null;
  try {
    // Match Next's path-parameter decoding, then enforce the existing UUID rule.
    const ids = (legacy ? legacy.slice(1) : [detail![1]]).map(value => decodeURIComponent(value));
    if (!ids.every(isWorkspaceId)) return { status: 404 };
    return legacy ? { status: 308, location: `/admin/nights/${ids[1]}` } : null;
  } catch {
    return { status: 404 };
  }
}

// The URL only selects from authorized, currently active rows, never a new read.
export function parseTonightNight(value: string | null): string | null {
  return isWorkspaceId(value) ? value : null;
}

export function selectTonightNight<T extends WorkspaceNight & { id: string }>(nights: T[], value: string | null, now: number): T | null {
  const active = groupWorkspaceNights(nights, now).active;
  const id = parseTonightNight(value);
  return active.find(night => night.id === id) ?? active[0] ?? null;
}
