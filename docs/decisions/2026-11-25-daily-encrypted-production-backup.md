# Production is backed up daily, encrypted with age, as a GitHub run artifact

Date: 2026-11-25 (#523). Completes `2026-11-25-save-before-removal-in-the-same-database.md`,
which protects a removal but not the loss of the project or a day-to-day mistake.

Every day at 03:17 UTC, `.github/workflows/backup.yml` dumps the rows of
`auth`, `public` and `private` from production (`pg_dump --data-only`, through
the `database-production` environment and its existing `MIGRATION_DATABASE_URL`
secret), encrypts the stream with `age` to the founders' public keys (environment
secret `BACKUP_AGE_RECIPIENTS`), and keeps the file 30 days as the run's artifact. The
private keys stay with the founders. Restoring loads the rows into a database
built from the migrations, in one transaction, and refuses a database that
already holds accounts. Procedure: `docs/production-cutover.md`, "Daily backup
and restore".

**Why a nightly workflow and not Supabase Pro.** The issue left the choice open
(Pro at about 25 USD a month, or a nightly encrypted dump). The workflow costs
nothing, needs no plan change, and its restore is proven on every change by a
rehearsal on a disposable stack. Marwane confirms this choice when merging the
pull request. Pro remains the upgrade path once evenings bring revenue: its
backups restore from the dashboard, but they do not include photos either.

**Why GitHub artifacts and not a Cloudflare R2 bucket.** GitHub already holds the
production connection string and runs the release; storing the encrypted file
there adds no provider account, no bucket, no token secret and no expiry rule
to configure (artifact retention does it). The repository is public, so any
signed-in GitHub user can download an artifact: confidentiality rests entirely
on `age` encryption, and only public keys are ever stored on GitHub. The
privacy policy names GitHub among the providers.

**Why data only, from the three schemas.** The schema, grants, policies,
buckets and scheduled jobs come from `supabase/migrations/` in git; only the
rows are lost. Vault secrets are encrypted with a key of the project and are
entered again; photo files are not in a database dump (guests upload again
after the loss of the project). A logic test fails when a migration writes to a
schema that is neither backed up nor explicitly skipped.

**Why 30 days.** The same window as the removal copies: long enough to notice a
silent mistake, short enough that an erased participant leaves the backups
within a month.

**What we give up.** Photos are not backed up. A private key lost by every
founder makes every backup unreadable. The first run on production has not
happened yet: it waits for the merge and the `BACKUP_AGE_RECIPIENTS` secret.

**Why the public keys are a secret.** They are not confidential, but the Actions
runner prints configuration variables in the public log before any step runs:
a private key pasted there by mistake would be published before the script could
refuse it. A secret is masked.
