import { randomUUID } from "node:crypto";
import { createClient, type Session } from "@supabase/supabase-js";
import { test as base, type BrowserContext, type BrowserContextOptions } from "@playwright/test";
import type { Database } from "../../lib/database.types";
import { testEnv } from "./env";

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
  private lastSignInAt = 0;

  async identity(name: string, gender?: "woman" | "man"): Promise<TestIdentity> {
    // Supabase limits consecutive anonymous sign-ins even with isolated users.
    const delay = 1_100 - (Date.now() - this.lastSignInAt);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    this.lastSignInAt = Date.now();
    const client = createClient<Database>(this.env.url, this.env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session) throw error ?? new Error("Anonymous test sign-in failed");
    const id = data.session.user.id;
    this.userIds.push(id);
    const { error: metadataError } = await this.service.auth.admin.updateUserById(id, {
      app_metadata: { e2e_run: this.runId },
    });
    if (metadataError) throw metadataError;
    if (gender) {
      const { error: profileError } = await this.service.from("profiles").insert({
        id, first_name: name, gender,
        bio: `${name} is here for a good conversation and a great night.`,
        photo_url: "http://127.0.0.1:3100/favicon.ico",
        interested_in: ["woman", "man", "nonbinary"],
      });
      if (profileError) throw profileError;
      const { error: privateError } = await this.service.from("profile_private").insert({
        id, adult_confirmed_at: new Date().toISOString(),
      });
      if (privateError) throw privateError;
    }
    return { id, name, session: data.session };
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
    const errors: unknown[] = [];
    // Continue after each failure; leftover fixtures must fail the test, not just log.
    const attempt = async (operation: () => PromiseLike<{ error: unknown }>) => {
      try {
        const { error } = await operation();
        if (error) errors.push(error);
      } catch (error) { errors.push(error); }
    };
    for (const venue of this.venues) {
      if (!venue.slug.startsWith(`e2e-${this.runId}-`)) throw new Error("Refusing to clean an unowned venue");
      await attempt(() => this.service.from("reports").delete().eq("venue_id", venue.id));
      await attempt(() => this.service.from("venues").delete().eq("id", venue.id).eq("slug", venue.slug));
    }
    for (const id of this.userIds) {
      // Auth deletion does not delete Storage objects uploaded during onboarding.
      await attempt(async () => {
        const { data, error } = await this.service.storage.from("profile-photos").list(id);
        if (error) return { error };
        if (data.length) return this.service.storage.from("profile-photos").remove(data.map((file) => `${id}/${file.name}`));
        return { error: null };
      });
      await attempt(() => this.service.auth.admin.deleteUser(id));
    }
    if (errors.length) throw new AggregateError(errors, `E2E cleanup failed for run ${this.runId}`);
  }
}

type Fixtures = {
  data: TestData;
  contextFor: (identity: TestIdentity) => Promise<BrowserContext>;
};

export const test = base.extend<Fixtures>({
  data: async ({}, provide, testInfo) => {
    const data = new TestData();
    testInfo.annotations.push({ type: "fixture-run", description: data.runId });
    try { await provide(data); } finally { await data.dispose(); }
  },
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
        return context;
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  },
});
