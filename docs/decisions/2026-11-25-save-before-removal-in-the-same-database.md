# A removal is saved in the same database, in the same transaction

Date: 2026-11-25 (#510). Lifts the refusal of removals recorded in
`2026-11-23-migrations-applied-only-by-the-merge-workflow.md` ("removals are
refused until a pre-removal backup exists").

Before the ledger applies a migration that removes, renames or is not
recognised, it copies every table of `public` and `private`, rows included,
into a schema `removal_backup_<version>_<hash>` of the same database, inside the
transaction that then applies the file. If the copy fails, the transaction
rolls back and nothing is removed. Copies are dropped by the first ledger run
more than 30 days later. `REMOVALS_ACCEPTED` in the pull request check and the
ledger refusal are lifted together.

**Why in the database and not a file elsewhere.** Three options were compared
with Marwane: an `age`-encrypted dump uploaded as a GitHub Actions artifact
(the repository is public, so only encryption protects it; a new data host,
GitHub in the United States, and a private key to keep), an encrypted dump in a
Cloudflare R2 bucket (a bucket, a token secret and a key to manage), or a copy
in the same database. The copy won on simplicity, not on legal grounds (the
privacy policy could have been adapted): no tool to install, no key that can
be lost, no secret, no new provider; "no save, no removal" is guaranteed by the
database transaction rather than by step ordering; restoring is a migration
that reads the copy; and an erasure request reaches the copy like any table.

**Why every application table and not only the removed object.** The
classifier names no object for an unrecognised statement or a `DO` block, and
names columns without their table. Copying everything needs no parsing to be
right. The data is small (Free plan) and the copy lives 30 days.

**Why no copy of definitions.** Tables, grants and policies are created by the
migrations in git; only the rows are lost by a removal.

**What we give up.** The copy does not survive the loss of the Supabase
project. That risk is not what #510 is about: a daily backup of production
(Supabase Pro or a nightly encrypted dump) is a separate decision, #523, tracked on
the board. Copies also use database quota for 30 days, and a removal holds a
`SHARE` lock on the application tables (writes wait, reads continue) for the
few seconds the copy and the removal take.
