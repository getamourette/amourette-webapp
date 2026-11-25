# Founder access requires two-step sign-in (TOTP), shipped in two steps

Date: 2026-11-25. Issues: #374 (SEC-011), #196.

**Decision.** A founder signs in to `/admin` with a password and a code from an
authenticator app (Supabase Auth TOTP). The database enforces it:
`private.is_admin()` will require an `aal2` session, so every admin RPC and
policy refuses a password-only session, not just the interface.

**Order.** The merge workflow applies a migration as soon as it merges, so the
requirement cannot ship with the enrollment screen: a founder without a factor
would be locked out of the door scanner and refunds. First pull request: the
enrollment and code screens, with no requirement. The founder enrolls on
production. Second pull request: the `aal2` requirement, merged only after that
enrollment is confirmed.

**Fallback.** The simplest one: scan the same QR code on two devices at setup.
Last resort: remove the factor from the production dashboard and enroll again.
Supabase recovery codes exist only in unreleased Auth versions; not used.

**Sign-up.** "Allow new users to sign up" also refuses anonymous sign-in, which
every guest uses (checked in the Supabase Auth source: `SignupAnonymously`
returns `signup_disabled`). Self-service sign-up is closed instead by a Before
User Created hook that accepts anonymous users only. Admin API creation does
not call the hook, so founder accounts are created in the dashboard.

**Deferred.** CAPTCHA (Supabase applies it to all Auth calls, guests included)
ships with #376 after the first night. Leaked-password protection needs the
Supabase Pro plan; accepted while on Free.

**Why.** A founder account controls refunds, arrivals, moderation and guest
data; a leaked password must not be enough. Two steps avoid trading takeover
risk for a lockout on the night of 10 December.

**Residual gap (review of #540).** The hook does not see an anonymous session
that adds an email and password to itself: that is an update, not a creation.
Such an account stays a participant, since founder access needs a row in
`admins` and a second factor. Blocking that conversion, and the mail it can
trigger, belongs with the anonymous abuse work (#376).
