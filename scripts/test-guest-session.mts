import assert from "node:assert/strict";
import { AuthApiError, AuthRefreshDiscardedError, AuthRetryableFetchError } from "@supabase/supabase-js";
import type { Session, User } from "@supabase/supabase-js";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { createGuestSession, GuestSessionEndedError, type GuestAuth } from "../lib/guest-session.ts";

// #480: a failed token refresh must never replace the guest's identity.
const ME = "00000000-0000-4000-8000-000000000001";
const NEW = "00000000-0000-4000-8000-000000000002";
const user = (id: string, anonymous = true) => ({ id, is_anonymous: anonymous }) as User;
const session = (id: string, anonymous = true) => ({ user: user(id, anonymous) }) as Session;
type Step = { session: Session | null; error: Error | null };

function harness(steps: Step[], hadIdentity: boolean) {
  const calls = { getSession: 0, signIn: 0, waits: 0 };
  let marked = hadIdentity ? ME : null;
  const auth = {
    async getSession() {
      const step = steps[Math.min(calls.getSession++, steps.length - 1)];
      return { data: { session: step.session }, error: step.error };
    },
    async signInAnonymously() {
      calls.signIn++;
      return { data: { user: user(NEW) }, error: null };
    },
  } as GuestAuth;
  const marker = { read: () => marked !== null, write: (id: string) => { marked = id; }, clear: () => { marked = null; } };
  const states: string[] = [];
  const guest = createGuestSession(auth, marker, async () => { calls.waits++; });
  guest.subscribe(() => states.push(guest.getState()));
  return { guest, calls, states, marked: () => marked };
}

const offline = () => new AuthRetryableFetchError("Failed to fetch", 0);
const serverDown = () => new AuthRetryableFetchError("Service unavailable", 503);
const revoked = () => new AuthApiError("Invalid Refresh Token: Already Used", 400, "refresh_token_already_used");

{
  // The refresh fails while the network is down, then succeeds: same identity.
  const h = harness([{ session: null, error: offline() }, { session: null, error: serverDown() }, { session: session(ME), error: null }], true);
  const result = await h.guest.ensure();
  assert.equal(result.id, ME, "the guest keeps her identity once the network is back");
  assert.equal(h.calls.signIn, 0, "a retryable refresh failure never signs in again");
  assert.equal(h.calls.waits, 2, "each retryable failure waits before retrying");
  assert.deepEqual(h.states, ["reconnecting", "ok"], "the guest sees reconnecting, then the page");
}

{
  // Concurrent pages share one wait and get the same identity.
  const h = harness([{ session: null, error: offline() }, { session: session(ME), error: null }], true);
  const [a, b] = await Promise.all([h.guest.ensure(), h.guest.ensure()]);
  assert.equal(a.id, ME);
  assert.equal(b.id, ME);
  assert.equal(h.calls.getSession, 2, "concurrent callers share the pending attempt");
}

{
  // The server refuses the refresh token: the session ended, no new identity.
  const h = harness([{ session: null, error: revoked() }], true);
  await assert.rejects(h.guest.ensure(), GuestSessionEndedError);
  assert.equal(h.calls.signIn, 0, "a revoked session is not replaced behind the guest's back");
  assert.equal(h.guest.getState(), "ended");
}

{
  // A background refresh already cleared the revoked session: this browser had
  // an identity, so it is still reported as ended.
  const h = harness([{ session: null, error: null }], true);
  await assert.rejects(h.guest.ensure(), GuestSessionEndedError);
  assert.equal(h.calls.signIn, 0);
  assert.equal(h.guest.getState(), "ended");

  // The guest chooses to start again: only then is a new identity created.
  h.guest.forgetIdentity();
  const fresh = await h.guest.ensure();
  assert.equal(fresh.id, NEW);
  assert.equal(h.calls.signIn, 1);
  assert.equal(h.marked(), NEW, "the new identity is remembered");
  assert.equal(h.guest.getState(), "ok");
}

{
  // Another tab rotated the tokens during this refresh: read storage again.
  const h = harness([{ session: null, error: new AuthRefreshDiscardedError() }, { session: session(ME), error: null }], true);
  assert.equal((await h.guest.ensure()).id, ME);
  assert.equal(h.calls.signIn, 0);
  assert.equal(h.calls.waits, 0);
}

{
  // A first visit signs in anonymously at once and remembers the identity.
  const h = harness([{ session: null, error: null }], false);
  assert.equal((await h.guest.ensure()).id, NEW);
  assert.equal(h.calls.signIn, 1);
  assert.equal(h.marked(), NEW);
  assert.deepEqual(h.states, [], "a first visit shows no notice");
}

{
  // A valid session is returned as is and remembered.
  const h = harness([{ session: session(ME), error: null }], false);
  assert.equal((await h.guest.ensure()).id, ME);
  assert.equal(h.marked(), ME);
}

{
  // A founder's password sign-in replaced the guest on purpose: its later
  // sign-out is not a lost guest session.
  const h = harness([{ session: session(ME, false), error: null }, { session: null, error: null }], true);
  assert.equal((await h.guest.ensure()).id, ME);
  assert.equal(h.marked(), null, "a password session clears the guest marker");
  assert.equal((await h.guest.ensure()).id, NEW);
  assert.equal(h.calls.signIn, 1);
}

console.log("guest session: identity kept on retryable failures, ended sessions never replaced silently");
