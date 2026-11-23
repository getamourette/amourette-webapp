# Pull request captures are published on `refs/pr-evidence/<N>`

Date: 2026-11-23 (#419)

Captures shown in a pull request are pushed by the agent as a parentless commit on
the Git reference `refs/pr-evidence/<pull request number>` and embedded in the
description with their `raw.githubusercontent.com` address, pinned to that commit.
The commands are in `docs/workflow.md`, "Proof and the founder card".

*Why:* the founder must see captures inside the pull request, on a phone, without
downloading anything. GitHub's own image upload (drag and drop in the editor) has
no API, so an agent cannot use it alone. The alternatives were weighed:

- Committing captures on the working branch puts review-only files in `main`
  forever.
- A dedicated branch shows up in the branch list and in `standup`, and every push
  to it starts a Vercel deployment.
- Release assets need a public release shown on the repository page, and unique flat
  file names across all pull requests.
- CI artifacts are files to download, which is what we are leaving.

A reference outside `refs/heads/` has none of these costs: it is not a branch, it
was verified to start neither CI nor a Vercel deployment, one reference per pull
request means two agents never collide, and the commit in the address makes a
capture immutable. It was proven on the pull request that introduced it.

*Limits:* it relies on the repository being public; if it becomes private the
addresses stop loading outside GitHub and the method must be revisited. Because
the repository is public, captures show fixture data only. A redone set of
captures is a new commit, so every address in the description is replaced.
