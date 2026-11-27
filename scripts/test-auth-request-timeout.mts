import assert from "node:assert/strict";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { withAuthRequestTimeout } from "../lib/auth-request-timeout.ts";

// #244: an Auth request that never answers must give up, so the guest's screen
// reaches its Retry path; other Supabase requests keep their own transport.
const BASE = "https://project.supabase.co";
const seen: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
const hanging: typeof fetch = (input, init) => {
  seen.push({ url: String(input), signal: init?.signal });
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  });
};
const timed = withAuthRequestTimeout(BASE, 20, hanging);

// A hung sign-in is aborted with a timeout error.
const started = Date.now();
await assert.rejects(timed(`${BASE}/auth/v1/signup`, { method: "POST" }), (error: Error) => error.name === "TimeoutError");
assert.ok(Date.now() - started < 1_000, "the Auth request gives up after its timeout");

// Database and Storage requests are left alone: no signal added.
void timed(`${BASE}/rest/v1/profiles`);
void timed(`${BASE}/storage/v1/object/upload/sign/staging/x`, { method: "PUT" });
assert.equal(seen.at(-2)!.signal, undefined);
assert.equal(seen.at(-1)!.signal, undefined);

// A caller's own abort still wins before the timeout.
const caller = new AbortController();
const pending = timed(`${BASE}/auth/v1/token?grant_type=refresh_token`, { signal: caller.signal });
caller.abort(new Error("caller"));
await assert.rejects(pending, /caller/);

// An Auth URL on another host is not ours to bound.
void timed("https://elsewhere.example.com/auth/v1/signup");
assert.equal(seen.at(-1)!.signal, undefined);

console.log("auth request timeout: ok");
process.exit(0);
