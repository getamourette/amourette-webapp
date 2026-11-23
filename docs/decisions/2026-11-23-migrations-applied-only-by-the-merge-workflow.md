# Migrations reach both databases only through the merge workflow

Date: 2026-11-23 (#434). Supersedes the manual rule of
`docs/production-cutover.md`, "Keeping the two projects aligned" (2026-11-16),
and the "dual-tracked" and "testing a schema change before merge" rules of
`AGENTS.md`.

A merge into `main` runs `.github/workflows/deploy.yml`: it applies the pending
files of `supabase/migrations/` to development, then production, compares both
catalogs, and only then deploys the code to Vercel production. Vercel no longer
deploys `main` from Git (`vercel.json`). No thread applies a migration file to a
hosted project by hand; a branch tries an additive file on development with the
workflow's `development` mode.

**Why.** Before this, a founder thread applied each merged file to production by
hand after Vercel had already deployed the code that needed it. That left
three risks: code live before its schema, a file applied by
hand on one project and not the other makes them drift, and the comparison
depended on someone remembering to run it. With real participants from the
first evening (planned around 2026-12-10), each of those is a broken venue
night. The workflow makes the order fixed (schema first, code second), makes
"what is applied" a fact the databases record (`migration_ledger.applied`,
with a checksum, so an edited file is caught), and turns the comparison into a
step that blocks the deployment.

**Why the CLI deploys and not a Vercel deploy hook.** A deploy hook would
build the branch head at the time it is called, which may already contain a
later merge whose migrations have not run. `vercel deploy --prod` from the
checked-out commit deploys exactly what was migrated for.

**Why fix forward.** The Free plan has no backup, so a failed release is never
rolled back by restoring a database: the run stops before the deployment, the
previous code keeps serving on a schema that is a superset of what it needs
(removals are refused until a pre-removal backup exists), and a new pull
request fixes the cause.

**Why an empty ledger refuses everything on a hosted database.** Both projects
already hold every file. Without the one-time baseline, a run would replay
them all on top of the existing schema; the ledger refuses instead, so the
activation order (freeze, check, baseline, then merge the trigger) cannot be
skipped by accident.

**What we give up.** A behaviour or removal migration can no longer be tried on
a branch preview against development: it is proven before merge on the
disposable local stacks of CI (including "Live code on the new schema").
