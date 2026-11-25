import { test, expect, type Page } from "@playwright/test";

// #489: reservation emails that did not go out are visible on every admin screen,
// and a stopped one is resent only by a founder tap. Mocked backend: no Resend call.
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const now = new Date("2026-12-01T20:00:00Z");
const problem = (value: number, state: "failed" | "unknown", kind: string, firstName: string) => ({
  id: id(value), kind, state, attempts: state === "failed" ? 3 : 690, first_name: firstName,
  venue_name: "Le Salon", timezone: "Europe/Paris", starts_at: "2026-12-10T19:00:00Z",
});

async function mockAdmin(page: Page, problems: ReturnType<typeof problem>[]) {
  await page.clock.setFixedTime(now);
  if (process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS) {
    const origin = new URL(process.env.E2E_BASE_URL).origin;
    await page.route(url => url.origin === origin, route => route.continue({ headers: {
      ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS!,
    } }));
  }
  const state = { problems, resent: [] as unknown[], refuse: false, total: undefined as number | undefined };
  await page.route("**/auth/v1/**", route => route.abort());
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer();
    else socket.close();
  });
  await page.route("**/rest/v1/**", route => {
    const endpoint = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (endpoint === "admin_moderation_queue") return reply([]);
    if (endpoint === "admin_launch_mail_problems") return reply({ total: state.total ?? state.problems.length, items: state.problems });
    if (endpoint === "admin_resend_launch_mail") {
      const payload = route.request().postDataJSON() as { p_id: string };
      state.resent.push(payload);
      if (state.refuse) return reply({ message: "mail not resendable" }, 400);
      state.problems = state.problems.filter(item => item.id !== payload.p_id);
      return reply(null);
    }
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return reply([]);
    if (endpoint === "venue_nights") return reply([]);
    if (endpoint === "admin_venue_night_participant_counts") return reply([]);
    throw new Error(`Unexpected backend request: ${endpoint}`);
  });
  return state;
}

const alert = (page: Page) => page.getByRole("main").getByRole("alert").filter({ hasText: /reservation emails? not delivered/ });

test("undelivered reservation emails alert founders and a stopped one is resent by a tap", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockAdmin(page, [problem(1, "failed", "confirmed_access", "Camille"), problem(2, "unknown", "refund_succeeded", "Alexandra")]);
  await page.goto("/admin");
  await expect(alert(page)).toContainText("2 reservation emails not delivered");
  await page.screenshot({ path: testInfo.outputPath("mail-alert-collapsed-390.png") });
  await alert(page).getByRole("button", { name: "Review" }).click();
  const retrying = alert(page).getByRole("listitem").filter({ hasText: "Camille" });
  const stopped = alert(page).getByRole("listitem").filter({ hasText: "Alexandra" });
  await expect(retrying).toContainText("Confirmation with QR");
  await expect(retrying).toContainText("Retrying automatically (attempt 3)");
  await expect(retrying.getByRole("button")).toHaveCount(0);
  await expect(stopped).toContainText("Refund");
  await expect(stopped).toContainText("Stopped");
  await expect(alert(page)).not.toContainText("@");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mail-alert-open-390.png") });

  // A refused resend says so and keeps the email listed.
  state.refuse = true;
  await stopped.getByRole("button", { name: "Resend" }).click();
  await expect(alert(page)).toContainText("This email could not be resent. Refresh and try again.");
  await expect(stopped).toBeVisible();

  state.refuse = false;
  await stopped.getByRole("button", { name: "Resend" }).click();
  await expect(alert(page)).toContainText("1 reservation email not delivered");
  await expect(stopped).toHaveCount(0);
  expect(state.resent).toEqual([{ p_id: id(2) }, { p_id: id(2) }]);
});

test("a backlog larger than the list keeps the alert and its exact total", async ({ page }) => {
  const state = await mockAdmin(page, Array.from({ length: 50 }, (_, index) => problem(100 + index, "failed", "confirmed_access", `Guest${index}`)));
  state.total = 1200;
  await page.goto("/admin");
  await expect(alert(page)).toContainText("1200 reservation emails not delivered");
  await alert(page).getByRole("button", { name: "Review" }).click();
  await expect(alert(page).getByRole("listitem")).toHaveCount(50);
  await expect(alert(page)).toContainText("Showing the oldest 50.");
});

test("no alert when every reservation email went out", async ({ page }) => {
  await mockAdmin(page, []);
  const read = page.waitForResponse(response => response.url().includes("/rpc/admin_launch_mail_problems"));
  await page.goto("/admin");
  await read;
  await expect(alert(page)).toHaveCount(0);
});
