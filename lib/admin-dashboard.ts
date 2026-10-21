export type PrioritizableNight = {
  status: string;
  waiting_opens_at: string;
  closes_at: string;
  opened_at: string | null;
  terminal_at: string | null;
};

function priority(night: PrioritizableNight, now: number) {
  if (!night.terminal_at && night.status === "live") return 0;
  if (!night.terminal_at && night.status === "waiting") return 1;
  if (!night.terminal_at && night.status === "closed" && night.opened_at) return 2;
  if (!night.terminal_at && Date.parse(night.waiting_opens_at) > now) return 3;
  return 4;
}

export function selectVenueNight<T extends PrioritizableNight>(nights: T[], now: number) {
  return [...nights].sort((a, b) => {
    const priorityDifference = priority(a, now) - priority(b, now);
    if (priorityDifference) return priorityDifference;
    if (priority(a, now) === 3) {
      return a.waiting_opens_at.localeCompare(b.waiting_opens_at);
    }
    return b.waiting_opens_at.localeCompare(a.waiting_opens_at);
  })[0];
}

export function venueNightKey(night: PrioritizableNight, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(night.closes_at));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function productionVenueUrl(slug: string) {
  return `https://getamourette.com/v/${slug}`;
}

export function launchFollowsEntry(date: string, entry: string, launch: string) {
  return Boolean(date && entry && launch && `${date}T${launch}` > `${date}T${entry}`);
}

export function productionEventUrl(nightId: string) {
  return `https://getamourette.com/events/${nightId}`;
}

// The launch reservation policy and server use entry (event start) minus 30 minutes.
export function registrationClosesAt(startsAt: string) {
  return new Date(Date.parse(startsAt) - 30 * 60_000).toISOString();
}

export const nightTabs = ["overview", "reservations", "waitlist", "arrivals", "activity", "report"] as const;
export type NightTab = typeof nightTabs[number];
export function availableNightTabs(configured: boolean, terminal: boolean): NightTab[] {
  return nightTabs.filter(tab => tab === "overview" || (tab === "report" ? terminal : configured));
}
export function parseNightTab(value: string | null, configured: boolean, terminal: boolean): NightTab {
  return availableNightTabs(configured, terminal).find(tab => tab === value) ?? "overview";
}

export function nightTimeline(night: { waiting_opens_at: string; guaranteed_launch_at: string; closes_at: string; launch_threshold: number }, registrationOpens: string | null, now: number) {
  const steps = [
    ...(registrationOpens ? [
      { label: "Registration opens", at: registrationOpens, detail: "Deposit, currency, policy and schedule become fixed." },
      { label: "Registration closes", at: registrationClosesAt(night.waiting_opens_at), detail: "30 minutes before entry, or when full." },
    ] : []),
    { label: "Entry opens", at: night.waiting_opens_at, detail: "Guests can check in to this night." },
    { label: "Matching starts", at: night.guaranteed_launch_at, detail: `Guaranteed launch; earlier once ${night.launch_threshold} people are checked in.` },
    { label: "Night closes", at: night.closes_at, detail: "The night ends and guests are checked out. Likes and chats are deleted." },
  ];
  return steps.map(step => ({ ...step, done: Date.parse(step.at) <= now }));
}
