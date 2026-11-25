// The minute a night's matches and messages are deleted, in the venue's time
// zone on a 24-hour clock ("02:00"), shown in the room header and the chat
// opener (#483). Returns null for a missing or unparseable instant or zone so
// the caller shows nothing rather than a wrong time.
export function nightEndTime(closesAt: string | null | undefined, timeZone: string | null | undefined, locale: string): string | null {
  if (!closesAt || !timeZone) return null;
  const at = new Date(closesAt);
  if (Number.isNaN(at.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  } catch {
    return null;
  }
}
