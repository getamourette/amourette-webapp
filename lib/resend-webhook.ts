import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySvixSignature(
  payload: string,
  id: string,
  timestamp: string,
  signatures: string,
  secret: string,
  nowMs = Date.now()
) {
  if (!/^\d{1,12}$/.test(timestamp) || id.length > 200 || signatures.length > 4096) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(nowMs / 1000 - seconds) > 300) return false;
  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try { key = Buffer.from(encodedSecret, "base64"); } catch { return false; }
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  return signatures.split(" ").some((entry) => {
    const encoded = entry.startsWith("v1,") ? entry.slice(3) : "";
    try {
      const actual = Buffer.from(encoded, "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch { return false; }
  });
}

type ResendEvent = {
  type: string;
  created_at: string;
  data: { email_id: string; to?: string[]; bounce?: { type?: string } };
};

// Unknown event names remain forward-compatible; their envelope is still bounded.
export function isResendEvent(value: unknown): value is ResendEvent {
  const record = (item: unknown): item is Record<string, unknown> =>
    typeof item === "object" && item !== null && !Array.isArray(item);
  const text = (item: unknown, max: number): item is string =>
    typeof item === "string" && item.length > 0 && item.length <= max && !/[\u0000-\u001f\u007f]/.test(item);
  if (!record(value) || !text(value.type,120) || !isIsoTimestamp(value.created_at) || !record(value.data) || !text(value.data.email_id,200)) return false;
  const { to, bounce } = value.data;
  if (to !== undefined && (!Array.isArray(to) || to.length > 100 || !to.every((item) => text(item,254)))) return false;
  if (bounce !== undefined && (!record(bounce) || (bounce.type !== undefined && !text(bounce.type,120)))) return false;
  return true;
}

// An explicit offset is required. Date.parse alone accepts rolled-over dates.
export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 35) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [,year,month,day,hour,minute,second,,offsetHour,offsetMinute] = match;
  const y=Number(year), m=Number(month), d=Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  return y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= days[m-1] &&
    Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 &&
    (!offsetHour || (Number(offsetHour) <= 14 && Number(offsetMinute) < 60 &&
      (Number(offsetHour) < 14 || Number(offsetMinute) === 0))) &&
    Number.isFinite(Date.parse(value));
}
