# Production is backed up daily, encrypted with age, in a private GitHub repository

Date: 2026-11-25 (#523). Completes `2026-11-25-save-before-removal-in-the-same-database.md`,
which protects a removal but not the loss of the project or a day-to-day mistake.

Every day at 03:17 UTC, the private repository `getamourette/amourette-backups`
calls the reusable workflow `.github/workflows/backup.yml` of this repository's
`main`. It dumps the rows of `auth`, `public` and `private` from production
(`pg_dump --data-only`, with the private repository's `BACKUP_DATABASE_URL`
secret), encrypts the stream with `age` to the founders' public keys (secret
`BACKUP_AGE_RECIPIENTS`), and keeps the file 30 days as a run artifact of the
private repository. The private keys stay with the founders. Each backup names the last migration its
rows fit. Restoring loads the rows, in one transaction, into a database built
from the migrations up to that file, and refuses one at another migration or
holding any row outside the tables the migrations seed; later migrations are
applied after the restore. Procedure: `docs/production-cutover.md`, "Daily backup
and restore".

**Why a nightly workflow and not Supabase Pro.** The issue left the choice open
(Pro at about 25 USD a month, or a nightly encrypted dump). The workflow costs
nothing, needs no plan change, and its restore is proven on every change by a
rehearsal on a disposable stack. Marwane confirms this choice when merging the
pull request. Pro remains the upgrade path once evenings bring revenue: its
backups restore from the dashboard, but they do not include photos either.

**Why a private repository and not this one or a Cloudflare R2 bucket.**
Artifacts of this public repository can be downloaded by any GitHub account:
even encrypted, a dating app's profiles should not be one leaked key away from
thirty days of copies anyone already holds. A private repository of the
organization makes them readable by the founders only, with the fewest
gestures: create the repository and add two secrets; no bucket, token,
lifecycle rule or payment method as R2 would need. The workflow stays in this
repository, reviewed, and refuses to back up anywhere but the private one. The
cost is a second copy of the production connection string, in a repository
only the founders can reach. The privacy policy names GitHub among the
providers.

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
