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

No service-role key, SMTP credential, founder password, or recovery token belongs
in a `NEXT_PUBLIC_` variable. The browser uses only the Supabase publishable key.

## Recover access

1. Open `/admin`, enter the founder email, and choose **Forgot password?**.
2. The page always gives the same confirmation and does not reveal whether the
   address belongs to an account.
3. Open the Supabase recovery email in the same browser and follow its link to
   `/admin/reset-password`.
4. The application requires Supabase's one-shot `PASSWORD_RECOVERY` redirect event,
   then verifies that recovered session through `am_i_admin()` before showing the
   password form. A normal signed-in founder session cannot unlock this route.
5. Enter and confirm a password of at least 12 characters.
6. After the update, every existing session is signed out. Sign in again at
   `/admin` with the new password.

Expired or invalid links must be replaced by a new recovery request. A recovered
account that is not in the founder allow-list is signed out and cannot use the
admin reset form.

## Rotate a known password

1. Sign in at `/admin` and choose **Change password**.
2. Enter the current password, then enter and confirm the new password.
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
