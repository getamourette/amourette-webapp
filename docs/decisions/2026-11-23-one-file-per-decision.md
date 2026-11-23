# Record each decision in its own file

Date: 2026-11-23 (#418)

New decisions go in `docs/decisions/YYYY-MM-DD-short-slug.md`, one file per
decision, with the same content an entry always had: what was decided and why.
`docs/decisions.md` is frozen as an archive with a note at its top; its 274
existing entries are not split. There is no index file: the dated file names
are the index.

*Why:* `docs/decisions.md` was one append-only file of more than 7,000 lines.
Every pull request appended at the end, so two open pull requests always
conflicted there; it happened three times on 2026-11-19 alone (#412 against
#409 and #394). Separate files never touch the same lines, so two branches
that each record a decision merge cleanly. An index would recreate the same
shared edit point, so it is deliberately absent. Splitting the old entries
would cost a large diff for no gain: the conflict came from new entries only,
and sorting which old decisions still hold is tracked separately.

CI treats a dated decision file exactly as it treated the old log: it is
documentation-only scope in `scripts/ci-plan.mjs`, and
`scripts/ci-reuse.mjs` accepts `docs/decisions/YYYY-MM-DD-short-slug.md` in
its reuse allowlist, so recording a decision after a validated run does not
repeat the browser suite. Any other file in that folder stays outside the
allowlist.
