# Admin password management

Founder accounts use Supabase Auth email/password authentication. Passwords and
recovery tokens are handled only by Supabase Auth; the application never stores
them in Postgres, environment variables, logs, or the repository.

## Required Supabase configuration

In **Authentication → URL Configuration**, keep the deployed application as the
Site URL and allow the reset route for every environment used to test recovery:

- production: `https://getamourette.com/admin/reset-password`
- Vercel previews: `https://amourette-webapp-git-*-tothe-moon.vercel.app/admin/reset-password`
- local development: `http://localhost:3000/admin/reset-password`

Use the narrowest preview wildcard supported by the project's actual Vercel
aliases. A redirect not present in this allow-list falls back to the configured
Site URL and will not open the reset form.

In **Authentication → Email**, confirm that the email provider and outbound SMTP
delivery are enabled. Keep **Secure password change** enabled. The in-dashboard
rotation flow confirms the current password first, creating a recent session
before the update.

### Founder account hardening (#374, #196)

Set on production by a founder, in the Supabase dashboard of the production
project (development keeps its own values; nothing here is declared in the
repository except the CI stack in `supabase/config.toml`):

| Setting (dashboard path) | Value | Why |
| --- | --- | --- |
| Authentication > Sign In / Providers > Email > **Minimum password length** | 12 | The 12 code point rule was only in the browser. Auth counts UTF-8 bytes up to v2.197 and code points from v2.198; either way a password the browser accepts is never refused. |
| Authentication > Multi-Factor > **TOTP (App Authenticator)** | Enabled (default) | Required for two-step sign-in. |
| Authentication > Auth Hooks > **Before User Created** | Postgres function `public.hook_before_user_created` | Closes self-service sign-up. Do **not** turn off "Allow new users to sign up": that switch also refuses `signInAnonymously()`, so every guest would be locked out. |
| Authentication > Sign In / Providers > **Allow anonymous sign-ins** | On (unchanged) | Guests. |
| Authentication > Email > **Prevent use of leaked passwords** | Not available on the Free plan (Pro and above) | Accepted gap until a paid plan; the founder passwords are unique and long. |
| CAPTCHA protection | Off until #376 | Supabase applies it to every Auth call, guests included; it ships with the guest CAPTCHA work after the first night. |

With the hook on, a new founder account is created only from Authentication >
Users > **Add user > Create new user** (the Admin API does not call the hook);
"Invite user" and the sign-up form are refused.

No service-role key, SMTP credential, founder password, or recovery token belongs
in a `NEXT_PUBLIC_` variable. The browser uses only the Supabase publishable key.

## Two-step sign-in

Founder access requires a code from an authenticator app (TOTP) as well as the
password. Supabase Auth stores the secret and checks each code; the database
grants founder access only to a session that used it (`aal2` in
`private.is_admin()`, second step of #374).

Set it up:

1. Sign in at `/admin`. A founder without an authenticator sees the setup
   screen instead of the console (a second device is added later with **Add an
   authenticator** in the account menu).
2. Scan the QR code with an authenticator app on your phone **and on a second
   device** (tablet, or a password manager that stores codes). Both show the
   same codes.
3. Enter the 6-digit code. From then on, signing in asks for the code after the
   password, and so do password rotation and recovery.

If the phone is lost: use the second device. If both are lost: in the
production dashboard, open Authentication > Users > the founder and remove the
authenticator factor (if the panel offers no such action, the SQL editor
statement `delete from auth.mfa_factors where user_id = '<founder id>';` does
the same; it is an account recovery, not a schema change), then sign in at
`/admin` and set it up again. That
dashboard is the last line, so it needs its own second factor on the Supabase
account.

## Recover access

1. Open `/admin`, enter the founder email, and choose **Forgot password?**.
2. The page always gives the same confirmation and does not reveal whether the
   address belongs to an account.
3. Open the Supabase recovery email in the same browser and follow its link to
   `/admin/reset-password`.
4. The application requires Supabase's one-shot `PASSWORD_RECOVERY` redirect event.
   When the account has an authenticator, it asks for its code first (Supabase
   refuses the password update without it). It then verifies the session through
   `am_i_admin()` before showing the password form. A normal signed-in founder session cannot unlock this route.
5. Enter and confirm a password of at least 12 characters.
6. After the update, every existing session is signed out. Sign in again at
   `/admin` with the new password.

Expired or invalid links must be replaced by a new recovery request. A recovered
account that is not in the founder allow-list is signed out and cannot use the
admin reset form.

## Rotate a known password

1. Sign in at `/admin` and choose **Change password**.
2. Enter the current password, the authenticator code when one is set up, then
   enter and confirm the new password.
3. The application reauthenticates the founder, rechecks `am_i_admin()`, and asks
   Supabase Auth to update the password.
4. After the update, every existing session is signed out. Sign in again with the
   new password.

## Safe test checklist

Use a founder-owned inbox and a temporary password that is not used anywhere else.
Never paste a password, recovery URL, access token, or email contents into an issue,
PR, terminal output, screenshot, or test fixture.

Recovery:

1. Confirm the generic success message for a recovery request.
2. Confirm the email link reaches the expected deployment, not another preview.
3. Confirm an expired or already-used link cannot reset the password.
4. While normally signed in as a founder, open `/admin/reset-password` directly and
   confirm that it does not show the reset form.
5. Set a temporary new password and confirm the old password no longer signs in.
6. Sign in with the temporary password, then rotate back to the founder's private
   password through the dashboard.

Rotation:

1. Confirm an incorrect current password is rejected.
2. Confirm mismatched new passwords are rejected locally.
3. Confirm a password shorter than 12 characters cannot be submitted.
4. Complete the rotation and confirm the prior password no longer signs in.
5. Confirm the new login still passes the founder allow-list and loads the admin
   dashboard.

After testing, close any recovery email and browser session that is no longer
needed. Do not use the shared temporary bootstrap password recorded in historical
operations.


## Input-contract verification (#77)

Both reset and in-dashboard rotation validate the new password minimum at submit,
independently of the browser's native field constraints. Keep existing login
passwords unchanged and never trim either password field. A local 12-character
check does not prove the deployed Auth policy: confirm `password_min_length` is at
least 12 in the project's Auth settings or Management API, then exercise rejection
through Auth with an isolated test account. On 2026-09-11, #77 tested a disposable,
confirmed synthetic email account tagged with `app_metadata.e2e_run`. The real
`auth.updateUser` endpoint accepted 11 ASCII characters and 11 code points including
an emoji, as well as both corresponding 12-code-point inputs. The minimum-12
rejection checks therefore failed. The account was deleted and absence confirmed;
no email was sent and no founder credentials were used.

The session has no Auth-config tool or Management API token; the configured value
could not be read or changed. In the project's Auth password settings, set minimum
length to 12, preserve other settings, and repeat the 11/12 ASCII and Unicode
checks through an ordinary authenticated session. Administrative user creation is
fixture setup, not evidence of ordinary password enforcement. Never use a
founder's real password as a test fixture.
