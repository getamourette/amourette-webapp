import { existsSync } from "node:fs";
import { assertBrowserTestTarget } from "../../scripts/development-target.mjs";

export function loadTestEnv() {
  // Node's parser handles quotes/comments. CI-provided values take precedence.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

export function testEnv() {
  loadTestEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceKey) {
    throw new Error("E2E requires the development Supabase URL, publishable key and server-only service-role key. See docs/workflow.md.");
  }
  // Fixtures create and delete users with the service role: the development
  // project (#367) or the disposable stack a CI runner starts on its own loopback.
  assertBrowserTestTarget(url);
  return { url, publishableKey, serviceKey };
}
