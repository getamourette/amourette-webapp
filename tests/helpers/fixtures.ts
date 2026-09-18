import { randomUUID } from "node:crypto";
import { createClient, type Session } from "@supabase/supabase-js";
import { test as base, type BrowserContext, type BrowserContextOptions } from "@playwright/test";
import type { Database } from "../../lib/database.types";
import { disposeFixtures } from "./fixture-cleanup";
import { testEnv } from "./env";
import { fixtureAuth, signInFixture, type FixtureAuth } from "./fixture-auth";

export { expect } from "@playwright/test";
export type TestIdentity = { id: string; name: string; session: Session };
type TestVenue = { id: string; slug: string; nightId: string };

export class TestData {
  readonly runId = randomUUID();
  readonly env = testEnv();
  readonly service = createClient<Database>(this.env.url, this.env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  private readonly userIds: string[] = [];
  private readonly venues: TestVenue[] = [];
  readonly authMode = fixtureAuth();
  readonly authCounts = { password: 0, anonymous: 0 };

  async identity(name: string, gender?: "woman" | "man", mode: FixtureAuth = this.authMode, photo?: Buffer): Promise<TestIdentity> {
    const client = createClient<Database>(this.env.url, this.env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await signInFixture(this.service, client, this.runId,
      id => { this.userIds.push(id); this.authCounts[mode] += 1; }, mode);
    const id = session.user.id;
    const { error: metadataError } = await this.service.auth.admin.updateUserById(id, {
      app_metadata: { e2e_run: this.runId },
    });
    if (metadataError) throw metadataError;
    if (gender) {
      let photoUrl = `${process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100"}/favicon.ico`;
      if (photo) {
        photoUrl = `${id}/${randomUUID()}.jpg`;
        const uploaded = await this.service.storage.from("profile-photos").upload(photoUrl, photo, {
          contentType: "image/jpeg", cacheControl: "0",
        });
        if (uploaded.error) throw uploaded.error;
      }
      const { error: profileError } = await this.service.from("profiles").insert({
        id, first_name: name, gender,
        bio: `${name} is here for a good conversation and a great night.`,
        photo_url: photoUrl,
        interested_in: ["woman", "man", "nonbinary"],
      });
      if (profileError) throw profileError;
      const { error: privateError } = await this.service.from("profile_private").insert({
        id, adult_confirmed_at: new Date().toISOString(),
      });
      if (privateError) throw privateError;
    }
    return { id, name, session };
  }

  async venue(): Promise<TestVenue> {
    const slug = `e2e-${this.runId}-${randomUUID().slice(0, 8)}`;
    const { data: venue, error } = await this.service.from("venues").insert({
      slug, name: `E2E ${this.runId.slice(0, 8)}`, city: "Paris", timezone: "Europe/Paris",
      is_live: true, is_test_venue: true,
    }).select("id, slug").single();
    if (error) throw error;
    const owned = { ...venue, nightId: "" };
    // Register before the next write so partial setup is also cleaned up.
    this.venues.push(owned);
    const now = Date.now();
    const { data: night, error: nightError } = await this.service.from("venue_nights").insert({
      venue_id: venue.id,
      waiting_opens_at: new Date(now - 3_600_000).toISOString(),
      guaranteed_launch_at: new Date(now - 1_800_000).toISOString(),
      closes_at: new Date(now + 3_600_000).toISOString(),
      launch_threshold: 2, status: "live",
      opened_at: new Date(now - 3_600_000).toISOString(),
      launched_at: new Date(now - 1_800_000).toISOString(), launch_reason: "threshold",
    }).select("id").single();
    if (nightError) throw nightError;
    owned.nightId = night.id;
    return owned;
  }

  async checkIn(venue: TestVenue, users: TestIdentity[]) {
    const { error } = await this.service.from("presence").insert(users.map(({ id }) => ({
      profile_id: id, venue_id: venue.id, venue_night_id: venue.nightId, is_visible: true,
    })));
    if (error) throw error;
  }

  async match(venue: TestVenue, alice: TestIdentity, bob: TestIdentity) {
    const [profile_a, profile_b] = [alice.id, bob.id].sort();
    const { data, error } = await this.service.from("matches").insert({
      profile_a, profile_b, venue_id: venue.id, venue_night_id: venue.nightId,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async dispose() {
    await disposeFixtures(this.service, this.runId, this.venues, this.userIds);
  }
}

type Fixtures = {
  data: TestData;
  contextFor: (identity: TestIdentity) => Promise<BrowserContext>;
};

export const test = base.extend<Fixtures>({
  data: [async ({}, provide, testInfo) => {
    const data = new TestData();
    testInfo.annotations.push({ type: "fixture-auth", description: data.authMode });
    const { error: photoMigrationError } = await data.service.from("photo_state").select("profile_id").limit(0);
    if (photoMigrationError) throw new Error("E2E requires the founder-approved #194 photo migration before creating fixtures: " + photoMigrationError.message);
    // Service credentials have no user identity: an installed owner RPC refuses
    // with 42501. Fail before fixtures when the coordinated #227 cutover is absent.
    const { error: discoveryMigrationError } = await data.service.rpc("get_my_profile");
    if (discoveryMigrationError?.code !== "42501") throw new Error("E2E requires the founder-approved #227 discovery migration before creating fixtures");
    testInfo.annotations.push({ type: "fixture-run", description: data.runId });
    try { await provide(data); } finally {
      testInfo.annotations.push({ type: "fixture-auth-counts", description: JSON.stringify(data.authCounts) });
      await data.dispose();
    }
  }, { timeout: 60_000 }],
  contextFor: async ({ browser, data, baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId }, provide) => {
    const contexts: BrowserContext[] = [];
    const options: BrowserContextOptions = {
      baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId,
    };
    try {
      await provide(async (identity) => {
        if (!baseURL) throw new Error("E2E needs a baseURL");
        const projectRef = new URL(data.env.url).hostname.split(".")[0];
        const context = await browser.newContext({
          ...options,
          storageState: { cookies: [], origins: [{
            origin: new URL(baseURL).origin,
            localStorage: [
              { name: `sb-${projectRef}-auth-token`, value: JSON.stringify(identity.session) },
              { name: "amourette-locale", value: "en" },
            ],
          }] },
        });
        contexts.push(context);
        // The injected preview toolbar can cover application controls on mobile.
        // Match the visual-test harness without changing deployment settings.
        await context.route('https://vercel.live/_next-live/feedback/feedback.js', route => route.abort());
        if (process.env.E2E_VERCEL_BYPASS) {
          // Scope the preview credential to the app; never send it to Supabase.
          await context.route(`${new URL(baseURL).origin}/**`, route => route.continue({
            headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! },
          }));
        }
        return context;
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  },
});
