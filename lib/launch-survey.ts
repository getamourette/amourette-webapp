// #559: the next-day survey. One contract for the page, the route and the
// database (submit_launch_survey refuses the same values).
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid } from "./input-validation.ts";
import type { Locale } from "./strings";

export const surveyAnswers = {
  matched: ["yes", "no"],
  talked: ["yes", "no"],
  at_ease: ["yes", "somewhat", "no"],
  heard: ["friend", "instagram", "venue", "street", "other"],
} as const;
export type SurveyQuestion = keyof typeof surveyAnswers;
export type SurveyAnswers = { [Q in SurveyQuestion]: (typeof surveyAnswers)[Q][number] | null };
export type SurveyInput = { link: string; token: string; answers: SurveyAnswers; next_night: boolean };
export type SurveyPage = { status: "open" | "answered" | "expired"; locale: Locale; venue_name: string; starts_at: string; timezone: string } | { status: "invalid" };

const token = /^[0-9a-f]{64}$/;
// The email link is /survey#<mail id>.<token>: the fragment never reaches a server log.
export function parseSurveyFragment(hash: string): { link: string; token: string } | null {
  const [link, secret, extra] = hash.replace(/^#/, "").split(".");
  return extra === undefined && isUuid(link) && typeof secret === "string" && token.test(secret) ? { link, token: secret } : null;
}

// Every question is optional, but an empty submission is refused unless the
// guest only ticked the next-night box.
export function parseSurveyInput(value: unknown): SurveyInput {
  if (!isRecord(value) || !isUuid(value.link) || typeof value.token !== "string" || !token.test(value.token)
    || typeof value.next_night !== "boolean" || !isRecord(value.answers)) throw new Error("invalid_survey");
  const raw = value.answers;
  if (Object.keys(raw).some(key => !(key in surveyAnswers))) throw new Error("invalid_survey");
  const answers = {} as Record<SurveyQuestion, string | null>;
  for (const question of Object.keys(surveyAnswers) as SurveyQuestion[]) {
    const answer = raw[question] ?? null;
    if (answer !== null && !(surveyAnswers[question] as readonly unknown[]).includes(answer)) throw new Error("invalid_survey");
    answers[question] = answer as string | null;
  }
  if (!value.next_night && Object.values(answers).every(answer => answer === null)) throw new Error("invalid_survey");
  return { link: value.link, token: value.token, answers: answers as SurveyAnswers, next_night: value.next_night };
}

export function parseSurveyPage(value: unknown): SurveyPage {
  if (isRecord(value) && value.status === "invalid") return { status: "invalid" };
  if (!isRecord(value) || !["open", "answered", "expired"].includes(value.status as string) || !["en", "fr", "es"].includes(value.locale as string)
    || typeof value.venue_name !== "string" || value.venue_name.length > 120 || typeof value.starts_at !== "string" || !Number.isFinite(Date.parse(value.starts_at))
    || typeof value.timezone !== "string") throw new Error("invalid_survey_page");
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(); } catch { throw new Error("invalid_survey_page"); }
  return value as SurveyPage;
}
