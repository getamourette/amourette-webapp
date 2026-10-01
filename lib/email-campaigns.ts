import type { Locale } from "@/lib/strings";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid } from "./input-validation.ts";

export const CAMPAIGN_NIGHT_LIMIT = 20;
export const CAMPAIGN_PREFERENCE_URL = "https://getamourette.com/unsubscribe?token=CAMPAIGN_PREVIEW";
export type CampaignNight = {
  id: string; venue_id: string; name: string; city: string | null; timezone: string;
  waiting_opens_at: string; guaranteed_launch_at: string; closes_at: string;
};
export type CampaignMessage = { subject: string; html: string; text: string };
export type CampaignMessages = Record<Locale, CampaignMessage>;
export type CampaignAudience = { eligible: number; en: number; fr: number; es: number; frequency: number; suppressed: number };
export type CampaignCounts = { queued: number; sending: number; sent: number; delivered: number; skipped: number; failed: number; unknown: number };
export type Campaign = {
  id: string; created_at: string; confirmed_at: string | null; nights: CampaignNight[];
  messages: CampaignMessages; counts: CampaignCounts;
};
export type CampaignDashboard = { nights: CampaignNight[]; campaigns: Campaign[]; hasMore: boolean; sendingEnabled: boolean };
export type CampaignReview = { campaign: Campaign; audience: CampaignAudience };
export type CampaignCommand =
  | { action: "preview"; nightIds: string[] }
  | { action: "review"; campaignId: string }
  | { action: "confirm"; campaignId: string; audience: CampaignAudience; confirmed: true }
  | { action: "retry"; campaignId: string; confirmed: true };

export function isCampaignAudience(value: unknown): value is CampaignAudience {
  return isRecord(value) && Object.keys(value).length === 6 &&
    ["eligible", "en", "fr", "es", "frequency", "suppressed"].every(key =>
      typeof value[key] === "number" && Number.isSafeInteger(value[key]) && value[key] >= 0);
}

export function parseCampaignCommand(value: unknown): CampaignCommand | null {
  if (!isRecord(value)) return null;
  if (value.action === "preview") {
    if (Object.keys(value).length !== 2 || !Array.isArray(value.nightIds) ||
        value.nightIds.length < 1 || value.nightIds.length > CAMPAIGN_NIGHT_LIMIT ||
        !value.nightIds.every(isUuid)) return null;
    const ids = value.nightIds.map(id => id.toLowerCase());
    return new Set(ids).size === ids.length ? { action: "preview", nightIds: ids } : null;
  }
  if (!isUuid(value.campaignId)) return null;
  if (value.action === "review" && Object.keys(value).length === 2) return { action: "review", campaignId: value.campaignId };
  if (value.action === "retry" && value.confirmed === true && Object.keys(value).length === 3) return { action: "retry", campaignId: value.campaignId, confirmed: true };
  if (value.action === "confirm" && value.confirmed === true && Object.keys(value).length === 4 && isCampaignAudience(value.audience)) {
    return { action: "confirm", campaignId: value.campaignId, confirmed: true, audience: value.audience };
  }
  return null;
}

export function isCampaignMessage(value: unknown): value is CampaignMessage {
  return isRecord(value) && typeof value.subject === "string" && value.subject.length > 0 && value.subject.length <= 200 &&
    typeof value.html === "string" && value.html.length > 0 && value.html.length <= 200_000 &&
    typeof value.text === "string" && value.text.length > 0 && value.text.length <= 50_000;
}

export function campaignSchedule(night: CampaignNight, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale, { timeZone: night.timezone, dateStyle: "full", timeStyle: "short" });
  return `${formatter.format(new Date(night.waiting_opens_at))} – ${formatter.format(new Date(night.closes_at))} (${night.timezone})`;
}
