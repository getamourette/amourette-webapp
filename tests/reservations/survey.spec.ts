import { test, expect, type Page } from "@playwright/test";
import { parseSurveyInput } from "@/lib/launch-survey";
import { surveyStrings } from "@/lib/survey-strings";
import type { Locale } from "@/lib/strings";

// #559: the next-day survey page. The route is replaced by a stand-in that
// enforces the same body contract (parseSurveyInput); the database side is
// covered by scripts/test-launch-survey.mjs.
const link = "00000000-0000-4000-8000-000000000559";
const token = "ab".repeat(32);
const userId = "00000000-0000-4000-8000-000000005590";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, role: "authenticated", is_anonymous: true, exp: 4102444800 })}.signature`;

type Options = { status?: "open" | "answered" | "expired" | "invalid"; locale?: Locale; submit?: "recorded" | "answered" | "unavailable" };
async function setup(page: Page, options: Options = {}) {
  const state = { reads: 0, submits: [] as { body: Record<string, unknown>; authorization: string | undefined }[], signUps: 0, submit: options.submit ?? "recorded" };
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! } }));
  }
  await page.route("**/rest/v1/**", route => route.abort());
  await page.route("**/auth/v1/**", route => {
    if (!new URL(route.request().url()).pathname.endsWith("/auth/v1/signup")) return route.abort();
    state.signUps++;
    return route.fulfill({ json: { access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "refresh-559",
      user: { id: userId, aud: "authenticated", role: "authenticated", is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: "2026-12-11T10:00:00Z" } } });
  });
  await page.route("**/api/launch/survey", async route => {
    const request = route.request(); const body = request.postDataJSON() as Record<string, unknown>;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (body.action === "read") {
      state.reads++;
      expect(body).toEqual({ action: "read", link, token });
      return reply(options.status === "invalid" ? { status: "invalid" } : { status: options.status ?? "open", locale: options.locale ?? "fr", venue_name: "Le Comptoir",
        starts_at: "2026-12-10T19:00:00Z", timezone: "Europe/Paris" });
    }
    const { action, ...rest } = body;
    expect(action).toBe("submit");
    try { parseSurveyInput(rest); } catch { return reply({ error: "invalid_request" }, 400); }
    state.submits.push({ body: rest, authorization: request.headers().authorization });
    if (state.submit === "unavailable") { state.submit = "recorded"; return reply({ error: "survey_unavailable" }, 503); }
    return reply({ status: state.submit });
  });
  return state;
}
const open = (page: Page, fragment = `${link}.${token}`) => page.goto(`/survey#${fragment}`);

for (const locale of ["fr", "en"] as const) test(`${locale}: a guest answers, asks about the next night and sees the thank-you (#559)`, async ({ page }, info) => {
  const s = surveyStrings[locale];
  const state = await setup(page, { locale });
  await open(page);
  await expect(page.getByRole("heading", { name: s.title })).toBeVisible();
  await expect(page.getByText(locale === "fr" ? "Le Comptoir, jeudi 10 décembre" : "Le Comptoir, Thursday, December 10")).toBeVisible();
  // The token never stays in the address bar or the history.
  await expect(page).toHaveURL(/\/survey$/);
  await page.screenshot({ path: info.outputPath(`survey-open-${locale}.png`), fullPage: true });
  await page.getByRole("group", { name: s.matched }).getByLabel(s.no).check();
  await page.getByRole("group", { name: s.talked }).getByLabel(s.yes).check();
  await page.getByRole("group", { name: s.at_ease }).getByLabel(s.somewhat).check();
  await page.getByRole("group", { name: s.heard }).getByLabel(s.instagram).check();
  const box = page.getByRole("checkbox", { name: s.nextNight });
  await expect(box).not.toBeChecked();
  await box.check();
  await page.screenshot({ path: info.outputPath(`survey-filled-${locale}.png`), fullPage: true });
  await page.getByRole("button", { name: s.submit }).click();
  await expect(page.getByRole("heading", { name: s.done })).toBeVisible();
  await expect(page.getByRole("main").getByRole("status")).toContainText(s.saved);
  await expect(page.getByRole("main").getByRole("status")).toContainText(s.subscribed);
  expect(state.submits).toEqual([{ body: { link, token, answers: { matched: "no", talked: "yes", at_ease: "somewhat", heard: "instagram" }, next_night: true }, authorization: `Bearer ${accessToken}` }]);
  expect(state.signUps).toBe(1);
  await page.screenshot({ path: info.outputPath(`survey-done-${locale}.png`), fullPage: true });
});

test("without the next-night box, no identity is created and no session is sent", async ({ page }) => {
  const s = surveyStrings.fr; const state = await setup(page);
  await open(page);
  await page.getByRole("group", { name: s.at_ease }).getByLabel(s.yes).check();
  await page.getByRole("button", { name: s.submit }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(s.saved);
  await expect(page.getByRole("main").getByRole("status")).not.toContainText(s.subscribed);
  expect(state.submits).toEqual([{ body: { link, token, answers: { matched: null, talked: null, at_ease: "yes", heard: null }, next_night: false }, authorization: undefined }]);
  expect(state.signUps).toBe(0);
});

test("an empty survey is refused on the page; a failed send keeps the answers for a retry", async ({ page }) => {
  const s = surveyStrings.fr; const state = await setup(page, { submit: "unavailable" });
  await open(page);
  await page.getByRole("button", { name: s.submit }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(s.empty);
  expect(state.submits).toHaveLength(0);
  await page.getByRole("group", { name: s.matched }).getByLabel(s.yes).check();
  await page.getByRole("button", { name: s.submit }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(s.error);
  await expect(page.getByRole("group", { name: s.matched }).getByLabel(s.yes)).toBeChecked();
  await page.getByRole("button", { name: s.submit }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(s.saved);
  expect(state.submits).toHaveLength(2);
});

for (const [status, key] of [["answered", "answered"], ["expired", "expired"], ["invalid", "invalid"]] as const)
  test(`a ${status} link shows its state and no form`, async ({ page }) => {
    await setup(page, { status });
    await open(page);
    await expect(page.getByText(surveyStrings[status === "invalid" ? "en" : "fr"][key])).toBeVisible();
    await expect(page.getByRole("button", { name: /Envoyer|Send/ })).toHaveCount(0);
  });

test("a malformed link is refused without asking the server", async ({ page }) => {
  const state = await setup(page);
  await open(page, `${link}.not-a-token`);
  await expect(page.getByText(surveyStrings.en.invalid)).toBeVisible();
  expect(state.reads).toBe(0);
});
