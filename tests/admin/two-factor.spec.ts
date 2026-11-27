import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "../../lib/database.types";
import { test, expect } from "../helpers/fixtures";
import { totp, untilNextWindow } from "../helpers/totp";

// #374 (SEC-011) against real Supabase Auth: a founder enrols an authenticator
// from /admin, and from then on the password alone no longer opens the console.
// The TOTP secret is synthetic, created for a throwaway account on the test
// stack, and is never written to the report.

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

// A code is sent with at least 3 seconds left in its window, and never twice.
async function freshCode(page: Page, secret: string, used: Set<string>) {
  for (;;) {
    if (untilNextWindow() < 3_000) await page.waitForTimeout(untilNextWindow() + 250);
    const code = totp(secret);
    if (!used.has(code)) { used.add(code); return code; }
    await page.waitForTimeout(untilNextWindow() + 250);
  }
}

const sessionLevel = (page: Page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find(name => /^sb-.+-auth-token$/.test(name));
  const token = key ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token : "";
  const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
  return payload ? (JSON.parse(atob(payload)) as { aal?: string }).aal ?? null : null;
});

test("a founder without a second factor is refused until they set one up, then needs the code after the password", async ({ data, page }) => {
  test.setTimeout(150_000);
  const founder = await data.identity("Founder", undefined, "password");
  const email = founder.session.user.email!;
  const password = `e2e-${randomUUID()}`;
  expect((await data.service.auth.admin.updateUserById(founder.id, { password })).error).toBeNull();
  expect((await data.service.from("admins").insert({ user_id: founder.id })).error).toBeNull();
  const nav = page.getByRole("navigation", { name: "Admin", exact: true });

  // The database refuses the password-only (aal1) session, whatever the screen shows.
  const passwordOnly = createClient<Database>(data.env.url, data.env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await passwordOnly.auth.signInWithPassword({ email, password })).error).toBeNull();
  expect(await passwordOnly.rpc("am_i_admin")).toMatchObject({ data: false, error: null });
  expect((await passwordOnly.rpc("admin_night_stats")).error?.message).toMatch(/not authorized/);

  await page.goto("/admin");
  await signIn(page, email, password);
  const dialog = page.locator("main");
  await expect(dialog.getByText("Founder access needs a code")).toBeVisible();
  await expect(nav).toBeHidden();
  await expect(dialog.getByRole("heading", { name: "Set up two-step sign-in" })).toBeVisible();
  await expect(dialog.getByTestId("totp-qr")).toBeVisible();
  await dialog.getByRole("button", { name: "Can't scan? Show the setup key" }).click();
  const secret = (await dialog.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);

  // A code from another window is refused and nothing changes.
  const used = new Set<string>();
  await dialog.getByLabel("Authenticator code").fill(totp(secret, Date.now() - 10 * 60_000));
  await dialog.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(dialog.getByText(/That code did not work/)).toBeVisible();
  expect(await sessionLevel(page)).toBe("aal1");

  await dialog.getByLabel("Authenticator code").fill(await freshCode(page, secret, used));
  await dialog.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(nav).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set up two-step sign-in" })).toBeHidden();
  expect(await sessionLevel(page)).toBe("aal2");
  const factors = await data.service.auth.admin.mfa.listFactors({ userId: founder.id });
  expect(factors.data?.factors.filter(factor => factor.status === "verified")).toHaveLength(1);

  // Next sign-in: the password opens only the code step.
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page, email, password);
  await expect(page.getByRole("heading", { name: "Two-step sign-in" })).toBeVisible();
  await expect(nav).toBeHidden();
  expect(await sessionLevel(page)).toBe("aal1");

  await page.getByLabel("Authenticator code").fill(totp(secret, Date.now() - 10 * 60_000));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/That code did not work/)).toBeVisible();
  await expect(nav).toBeHidden();

  await page.getByLabel("Authenticator code").fill(await freshCode(page, secret, used));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(nav).toBeVisible();
  expect(await sessionLevel(page)).toBe("aal2");

  // A reload keeps the verified session instead of asking again.
  await page.reload();
  await expect(nav).toBeVisible();
});

test("Auth refuses self-service sign-up while guests still sign in", async ({ data }) => {
  // Self-service sign-up is closed by the Before User Created hook...
  const visitor = createClient<Database>(data.env.url, data.env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signUp = await visitor.auth.signUp({ email: `e2e-signup-${randomUUID()}@example.com`, password: `e2e-${randomUUID()}` });
  expect(signUp.data.user).toBeNull();
  expect(signUp.error?.status).toBe(403);
  expect(signUp.error?.message).toBe("Sign-up is closed.");

  // ...but anonymous guests are still created (every room journey relies on it).
  const guest = await data.identity("Guest", undefined, "anonymous");
  expect(guest.session.user.is_anonymous).toBe(true);
});

test("a recovery link asks an enrolled founder for the code before the new password", async ({ data, page, baseURL }) => {
  test.setTimeout(120_000);
  const founder = await data.identity("Founder", undefined, "password");
  expect((await data.service.from("admins").insert({ user_id: founder.id })).error).toBeNull();
  // Enrol a factor for the account directly through Auth, as the founder.
  const client = createClient<Database>(data.env.url, data.env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await client.auth.setSession(founder.session)).error).toBeNull();
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "e2e" });
  expect(enrolled.error).toBeNull();
  const secret = enrolled.data!.totp.secret;
  const used = new Set<string>();
  expect((await client.auth.mfa.challengeAndVerify({ factorId: enrolled.data!.id, code: await freshCode(page, secret, used) })).error).toBeNull();

  // The recovery link is generated, not mailed; it signs in with one factor.
  const link = await data.service.auth.admin.generateLink({
    type: "recovery", email: founder.session.user.email!, options: { redirectTo: `${baseURL}/admin/reset-password` },
  });
  expect(link.error).toBeNull();
  await page.goto(link.data.properties!.action_link);
  await expect(page.getByRole("heading", { name: "Two-step sign-in" })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toBeHidden();
  expect(await sessionLevel(page)).toBe("aal1");

  await page.getByLabel("Authenticator code").fill(totp(secret, Date.now() - 10 * 60_000));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/That code did not work/)).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toBeHidden();

  await page.getByLabel("Authenticator code").fill(await freshCode(page, secret, used));
  await page.getByRole("button", { name: "Verify" }).click();
  const password = `e2e-${randomUUID()}`;
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  const signedIn = await createClient<Database>(data.env.url, data.env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
    .auth.signInWithPassword({ email: founder.session.user.email!, password });
  expect(signedIn.error).toBeNull();
});
