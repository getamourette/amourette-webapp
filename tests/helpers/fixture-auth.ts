import { randomUUID } from "node:crypto";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type FixtureAuth = "anonymous" | "password";

export function fixtureAuth(value = process.env.E2E_FIXTURE_AUTH): FixtureAuth {
  if (value === undefined) return "password";
  if (value === "anonymous" || value === "password") return value;
  throw new Error("E2E_FIXTURE_AUTH must be exactly password or anonymous");
}

export function authFailure(error: unknown): Error {
  const details = error as { status?: number; code?: string; message?: string } | null;
  const limited = details?.status === 429 || details?.code === "over_request_rate_limit"
    || details?.code === "over_email_send_rate_limit"
    || /rate limit/i.test(details?.message ?? "");
  return new Error(limited
    ? "E2E infrastructure: Supabase Auth rate limit reached. No automatic retry; let fixture cleanup finish, then investigate shared usage."
    : "E2E infrastructure: Supabase Auth fixture setup failed.", { cause: error });
}

export async function signInFixture(
  service: Pick<SupabaseClient, "auth">,
  client: Pick<SupabaseClient, "auth">,
  runId: string,
  register: (id: string) => void,
  mode: FixtureAuth,
): Promise<Session> {
  let credentials: { email: string; password: string } | undefined;
  if (mode === "password") {
    credentials = { email: `e2e-${randomUUID()}@example.com`, password: randomUUID() };
    const created = await service.auth.admin.createUser({ ...credentials, email_confirm: true, app_metadata: { e2e_run: runId } });
    // Register ownership before checking later setup results or requesting a token.
    if (created.data.user) register(created.data.user.id);
    if (created.error) throw authFailure(created.error);
    if (!created.data.user) throw new Error("E2E Auth creation returned no user");
  }
  const { data, error } = credentials
    ? await client.auth.signInWithPassword(credentials)
    : await client.auth.signInAnonymously({ options: { data: { e2e_run: runId } } });
  if (!credentials && data.user) register(data.user.id);
  if (error) throw authFailure(error);
  if (!data.session) throw new Error("E2E Auth sign-in returned no session");
  if (data.session.user.role !== "authenticated") throw new Error("E2E requires an ordinary authenticated user session");
  if (data.session.user.is_anonymous !== (mode === "anonymous")) throw new Error("E2E Auth returned the wrong identity mode");
  return data.session;
}
