# Private details stay out of the public repository, without rewriting history

Decided by Marwane on 2026-11-25 (#535).

The repository is public. A pass over `main` found a founder's personal test inbox
(and its plus-aliases) in the decision archive and the reservation rehearsal report,
the address of an internal build machine and a LAN address in the design notes, and
two sandbox refund identifiers. They were replaced by neutral wording; the decisions
they appear in keep their meaning.

- **Clean the files now; repository visibility is a separate decision.** Whether the
  repository becomes private is left for later. Removing a file or a line does not erase
  it from Git history, forks or existing clones, so this pass reduces what a casual
  reader of `main` sees; it is not a substitute for fixing a flaw or revoking a secret.
- **No history rewrite.** A `filter-repo` and force-push on `main` would break every open
  pull request and every worktree, for details that are not secrets (none was found).
  Revisit only if a real secret is ever committed, and then revoke it first.
- **The rule lives in `AGENTS.md` (Conventions) and is enforced by a test.**
  `scripts/test-public-repo-hygiene.mjs` fails on a consumer-provider email address or a
  `100.64/10` tailnet address in any tracked file, and masks what it reports so a
  failure never republishes the value. It deliberately does not try to detect every kind
  of private detail (payment identifiers, names): those stay a written rule, because a
  pattern for them would mostly flag the synthetic fixtures the tests need.
- **The founders' private arrangements stay out too (Marwane, same day).** How the
  pilot came to be operated by its company, who is behind it, and the founders' own
  company and account situation were removed from the decision archive, the roadmap,
  the data-framework inventory and the payments runbook; the meeting brief that told
  that story was deleted. What the public needs is already in the legal notices.
- **Kept on purpose:** founder first names and GitHub logins (public on every commit,
  needed by the skills); the operator's name, contact address and publication director
  where a document drafts or records the published legal text (legal notices,
  processing register, impact assessment, policy drafts), since the app publishes them;
  and the Supabase project refs used by the safety guards (their URLs ship in the
  public client bundles).
