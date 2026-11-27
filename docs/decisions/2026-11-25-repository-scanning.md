# Repository scanning without noise; the review gate is the review trace, not a human approval

**Date:** 2026-11-25 · **Issue:** #375 (SEC-012)

## Decision

1. **Dependabot, security only, one pull request.** `.github/dependabot.yml`
   turns npm version updates off (`open-pull-requests-limit: 0`) and groups every
   npm security update into a single pull request. GitHub Actions get one grouped
   pull request a month at most, for a new major version.
2. **A Dependabot pull request is raw material, not a merge request.** An agent
   takes it over as a dependency upgrade (advisories before and after, release
   notes, full suite, card, review), or closes it with a reason. Its branch gets no
   Vercel preview (`vercel.json`): CI tests it on a local stack, and every preview
   spends the Hobby plan's daily deployments.
3. **CodeQL as a workflow file, off the required path.** `.github/workflows/codeql.yml`
   analyses JavaScript/TypeScript and the workflows themselves in one job, on pull
   requests that touch code, on `main` and weekly. It is not required and does not
   run in the merge queue.
4. **`CODEOWNERS`** names the owner of `.github/` and `supabase/migrations/`. It
   requests a review; it does not enforce one.
5. **`Review trace` also reports in the merge queue,** with an empty pass: the pull
   request was judged before it entered. This changes nothing today and is what
   makes requiring it possible without blocking the queue.

## Why

The audit asked for a required human approval on `main`. One founder merges, and
GitHub never lets an author approve their own pull request, while every agent opens
pull requests with that founder's account: a required approval would block every
merge, or be bypassed every time, which is worse than not having it. The review that
actually happens is the automated one, traced on the card (`AGENTS.md`, "Automatic
review"); requiring the `Review trace` check is the enforcement that matches it.

The residual risk is named, not hidden: a pull request can still change the
workflow that produces the required checks, and nobody but the founder reads it.
`.github/` is always in the sensitive lane, so the card tells the founder to read
it, and code scanning now covers the workflows too.

Security-only Dependabot because the repository had 70 open alerts on 2026-11-25,
almost all transitive development dependencies: one pull request per alert would
have opened dozens of branches, each spending CI runners and a Vercel deployment.
Version upgrades stay deliberate changes with their release notes read (#373 for
Next.js). A workflow file rather than CodeQL's default setup so the configuration
is reviewed in the repository and kept to one job under GitHub Free's 20-job cap.

## Applied on 2026-11-27

Repository settings, not files, applied with the founder's agreement after this
decision's pull request was merged:

- Dependabot security updates enabled (secret scanning, push protection, Dependabot
  alerts and private vulnerability reporting are on since 2026-11-16).
- `Required PR tests` ruleset: deletion and force pushes blocked, a pull request
  required with **zero** approvals and squash only, and `Review trace` required next
  to the two test checks. This settles the first open item of
  `docs/decisions/2026-11-25-review-lanes.md`; auto-merge stays open there.
- Merge methods: squash only; branches deleted after merge.
- The admin bypass stays, for pull requests only: the exit when CI itself is broken.
