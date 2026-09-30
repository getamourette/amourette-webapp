import { existsSync } from "node:fs";

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
  return { url, publishableKey, serviceKey };
}
