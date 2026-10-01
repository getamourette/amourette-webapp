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
