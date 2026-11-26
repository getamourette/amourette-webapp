# Auth requests time out after 15 seconds, like database requests

**Decision:** every browser request to Supabase Auth (`/auth/v1/`) is aborted after
15 seconds (`lib/auth-request-timeout.ts`, wired as the client's `global.fetch`).
Database requests keep their own `db.timeout` (#554); Storage uploads keep no
timeout.

**Why:** #554 bounded database requests but not Auth. On a bar Wi-Fi that stalls
instead of failing, a guest's first sign-in at the QR never answered and the
doorway logo stayed forever, with no Retry (#244). Every database request also
waits for the session first, so a stalled Auth request blocked the whole page.
supabase-js reports an aborted Auth request as a retryable network error, so the
existing recovery paths take over: the first scan shows its Retry screen, and a
stalled token refresh ends on "Reconnecting…" without replacing the guest's
identity (#480).

**Not chosen:** a timeout on Storage uploads, which can legitimately take longer
on a slow network with a large photo.
