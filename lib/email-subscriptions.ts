import type { Locale } from "@/lib/strings";
import { supabase } from "@/lib/supabase";

export const EMAIL_SUBSCRIPTION_SOURCES = [
  "landing",
  "room_popup",
  "waiting_room",
  "subscription_management",
] as const;

export type EmailSubscriptionSource =
  (typeof EMAIL_SUBSCRIPTION_SOURCES)[number];

// Each value identifies the consent copy shown at that capture surface. Do not
// collapse these into a generic schema version: they are an audit record of
// what the owner accepted.
export const EMAIL_CONSENT_VERSIONS: Record<EmailSubscriptionSource, string> = {
  landing: "2026-07-24",
  room_popup: "global-live-night-email-v1",
  waiting_room: "global-live-night-email-v1",
  subscription_management: "email-preferences-v1",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function unsubscribeMyEmail(): Promise<
  "unsubscribed" | "already_unsubscribed" | "failure"
> {
  const { data, error } = await supabase.rpc(
    "unsubscribe_my_email_subscription"
  );
  if (error) throw error;
  if (data === "unsubscribed" || data === "already_unsubscribed") return data;
  return "failure";
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export class InvalidEmailError extends Error {}

export async function getEmailSubscription() {
  const { data, error } = await supabase
    .from("email_subscriptions")
    .select(
      "user_id, email, locale, source, consent_version, status, subscribed_at, unsubscribed_at"
    )
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function subscribeEmail(
  email: string,
  locale: Locale,
  source: EmailSubscriptionSource
): Promise<{ alreadySubscribed: boolean; email: string }> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) throw new InvalidEmailError();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("No authenticated user");

  const existing = await getEmailSubscription();
  const alreadySubscribed =
    existing?.status === "subscribed" && existing.email === normalizedEmail;
  const now = new Date().toISOString();
  const { error } = await supabase.from("email_subscriptions").upsert(
    {
      user_id: user.id,
      email: normalizedEmail,
      locale,
      source,
      consent_version: EMAIL_CONSENT_VERSIONS[source],
      status: "subscribed",
      subscribed_at: alreadySubscribed ? existing.subscribed_at : now,
      unsubscribed_at: null,
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
  return { alreadySubscribed, email: normalizedEmail };
}
