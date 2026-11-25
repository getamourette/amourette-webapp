# A failed token refresh never replaces a guest's identity

Date: 2026-11-25 (#480)

`ensureAnonSession()` used to ignore the error returned by `getSession()` and
sign in anonymously whenever no session came back. A refresh that failed on a
bad network (or an Auth 5xx) therefore overwrote the only copy of the guest's
credential with a new anonymous user: profile, matches, chats and blocks lost,
the old account left checked in.

Now (`lib/guest-session.ts`):

- A retryable refresh failure keeps the stored session. The page shows a
  full-screen "Reconnecting…" notice and retries every 3 s until Supabase
  refreshes the same session. Supabase holds a failed refresh for 60 s before
  trying the network again, so recovery can take up to a minute after the
  network returns.
- A refresh the server refuses ends the session. The guest is told so and
  offered "Create a new profile"; only that click creates a new identity. The
  old session is never extended or retried.
- To tell a lost session from a first visit after Supabase cleared it in the
  background, the browser remembers the anonymous user id
  (`amourette-guest-identity`). A password session (a founder's admin) clears
  that marker, so the admin sign-out keeps starting a fresh guest as before.

Why not recover the old identity: guests have no login (V1 decisions of
2026-06-19 and later), and a revoked refresh token cannot be revived without
weakening Auth. Starting again with the guest's consent is the planned path;
a reservation and its arrival QR code do not depend on this session.
