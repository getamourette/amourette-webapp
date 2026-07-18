import { supabase } from "@/lib/supabase";

const SESSION_KEY = "amourette-analytics-session";
const ATTRIBUTION_KEY = "amourette-attribution";

export type AnalyticsEventName =
  | "landing_viewed"
  | "session_started"
  | "venue_experience_opened"
  | "discovery_opened"
  | "profile_viewed"
  | "chat_opened";

type Attribution = {
  qrCodeId?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  referrer?: string;
};

type EventProperties = {
  landing_viewed: Record<string, never>;
  session_started: Record<string, never>;
  venue_experience_opened: { status?: "checked_in" };
  discovery_opened: { visibleCount?: number };
  profile_viewed: { viewedProfileId: string; source?: "room" | "preview" };
  chat_opened: { matchId: string };
};

function safeStorage(storage: Storage | undefined, key: string) {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function setSafeStorage(storage: Storage | undefined, key: string, value: string) {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Analytics should never break the product flow.
  }
}

function sessionId() {
  if (typeof window === "undefined") return "server-session";
  const existing = safeStorage(window.sessionStorage, SESSION_KEY);
  if (existing) return existing;

  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  setSafeStorage(window.sessionStorage, SESSION_KEY, next);
  return next;
}

function readAttribution(): Attribution {
  if (typeof window === "undefined") return {};

  const stored = safeStorage(window.localStorage, ATTRIBUTION_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Attribution;
    } catch {
      return {};
    }
  }

  const params = new URLSearchParams(window.location.search);
  const attribution: Attribution = {
    qrCodeId: params.get("qr_code_id") ?? params.get("qr") ?? undefined,
    source: params.get("utm_source") ?? undefined,
    medium: params.get("utm_medium") ?? undefined,
    campaign: params.get("utm_campaign") ?? undefined,
    content: params.get("utm_content") ?? undefined,
    referrer: document.referrer || undefined,
  };

  if (Object.values(attribution).some(Boolean)) {
    setSafeStorage(window.localStorage, ATTRIBUTION_KEY, JSON.stringify(attribution));
  }

  return attribution;
}

export async function trackEvent<Name extends AnalyticsEventName>(
  eventName: Name,
  options: {
    venueId?: string | null;
    properties?: EventProperties[Name];
  } = {}
) {
  const attribution = readAttribution();
  const { error } = await supabase.rpc("track_analytics_event", {
    p_event_name: eventName,
    p_session_id: sessionId(),
    p_venue_id: options.venueId ?? null,
    p_qr_code_id: attribution.qrCodeId ?? null,
    p_source: attribution.source ?? null,
    p_medium: attribution.medium ?? null,
    p_campaign: attribution.campaign ?? null,
    p_content: attribution.content ?? null,
    p_referrer: attribution.referrer ?? null,
    p_properties: options.properties ?? {},
  });

  if (error) {
    console.warn("Could not track analytics event", eventName, error);
  }
}
