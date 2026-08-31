import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type Session } from "@supabase/supabase-js";
import type { Browser, BrowserContext } from "@playwright/test";

export const FIXTURE_PATH = resolve(".chat-test-fixture.json");

export type TestIdentity = {
  id: string;
  name: string;
  session: Session;
};

export type ChatFixture = {
  runId: string;
  venue: { id: string; slug: string };
  nightId: string;
  matchId: string;
  users: {
    alice: TestIdentity;
    bob: TestIdentity;
    intruder: TestIdentity;
    partners: TestIdentity[];
  };
};

export async function readFixture() {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ChatFixture;
}

export function loadTestEnv() {
  // Playwright loads no Next.js env files itself.
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // CI may provide the variables directly.
  }
}

export function serviceClient() {
  loadTestEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Chat tests need Supabase URL and service-role key.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function contextFor(browser: Browser, identity: TestIdentity): Promise<BrowserContext> {
  loadTestEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: `sb-${projectRef}-auth-token`, session: identity.session },
  );
  return context;
}
