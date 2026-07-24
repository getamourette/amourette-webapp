export type LocalDateTimeResolution =
  | { ok: true; iso: string; offsetLabel: string }
  | { ok: false; reason: "invalid" | "nonexistent" | "ambiguous"; message: string };

function wallMinute(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function resolveVenueLocalDateTime(value: string, timeZone: string): LocalDateTimeResolution {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return { ok: false, reason: "invalid", message: "Enter a complete local date and time." };
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
  } catch {
    return { ok: false, reason: "invalid", message: "This venue timezone is not valid." };
  }
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const matches: number[] = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = naiveUtc - offsetMinutes * 60_000;
    if (wallMinute(new Date(candidate), timeZone) === value) matches.push(candidate);
  }
  const unique = [...new Set(matches)];
  if (unique.length === 0) {
    return { ok: false, reason: "nonexistent", message: "This local time does not exist because the clocks move forward. Choose another time." };
  }
  if (unique.length > 1) {
    return { ok: false, reason: "ambiguous", message: "This local time occurs twice because the clocks move back. Choose an unambiguous time." };
  }
  const instant = new Date(unique[0]);
  const offsetMinutes = Math.round((naiveUtc - unique[0]) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return {
    ok: true,
    iso: instant.toISOString(),
    offsetLabel: `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`,
  };
}

export function isoToVenueLocalInput(iso: string, timeZone: string) {
  return wallMinute(new Date(iso), timeZone);
}

export function formatVenueInstant(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset",
  }).format(new Date(iso));
}
