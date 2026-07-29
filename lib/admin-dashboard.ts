export type PrioritizableNight = {
  status: string;
  waiting_opens_at: string;
  closes_at: string;
  terminal_at: string | null;
};

function priority(night: PrioritizableNight, now: number) {
  if (!night.terminal_at && night.status === "live") return 0;
  if (!night.terminal_at && night.status === "waiting") return 1;
  if (!night.terminal_at && Date.parse(night.waiting_opens_at) > now) return 2;
  return 3;
}

export function selectVenueNight<T extends PrioritizableNight>(nights: T[], now: number) {
  return [...nights].sort((a, b) => {
    const priorityDifference = priority(a, now) - priority(b, now);
    if (priorityDifference) return priorityDifference;
    if (priority(a, now) === 2) {
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
