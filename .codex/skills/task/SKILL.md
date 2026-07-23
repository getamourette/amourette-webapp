---
name: task
description: Capture a task onto the Amourette shared project board. Use when the user says /task, add a task, capture this, put it on the board, log a bug, or note an idea/question/op to track. Infers Kind/Area/Assignee/Priority from the title, decides draft-item vs real issue, creates it, and sets the fields. Never merges, branches, or writes code.
---

# Task

Capture one unit of work onto the shared board
(https://github.com/orgs/getamourette/projects/1) so it is tracked. Default to a
fast capture: a title in, a labelled board item out. The board is the source of
truth; if it is not here, it is not tracked.

## Decide: draft item or real issue

- **Real issue** (`gh issue create`, auto-added to `Inbox`): anything actionable and
  code-ish that will get a branch and a PR (bug, feature, design, infra, chore). The
  issue number is what `Closes #N` links the PR to later.
- **Draft item** (`gh project item-create`): a `question`, a raw idea, or a non-code
  op (marketing, legal, business, venue outreach). No repo noise. It is converted to a
  real issue only when someone picks it up and needs a branch.

When unsure, ask one short question rather than guess between draft and issue.

## Infer the fields (best-effort, only ask if ambiguous)

`Kind` = the nature of the work, `Area` = where it lives; they combine. Read them off
the title/context and set them without asking when the signal is clear. Ask only when
a field is genuinely ambiguous.

- **Kind:** `bug` (broken/regression) · `feature` (user-facing capability) · `design`
  (visual/DA/UX) · `infra` (technical non-bug: migration, CI, realtime, tooling) ·
  `question` (not yet decided) · `chore` (tests, docs, deps, config, security
  hardening, cleanup).
- **Area:** `landing` · `onboarding` · `room` · `match-chat` · `safety` · `admin` ·
  `design-system` · `platform` (infra/devops/Supabase/DB/auth/Vercel/CI/i18n) · `ops`
  (non-code).
- **Assignee:** `Marwane` or `Aymane` (the native GitHub assignee, so the avatar shows
  on the card) — set when the user names who takes it; otherwise leave unset (grabbable
  at triage).
- **Priority:** `P0`/`P1`/`P2` — set only if the user signals urgency; otherwise leave
  unset.
- **Status:** a fresh capture stays `Inbox`. Only move it to `Ready`/`Backlog` when the
  user is triaging, not just capturing. One exception: a `question` draft goes straight
  to `Backlog` (that is where open questions live, out of the daily view but in the
  Questions view) — unless the user flags it urgent/blocking, then leave it in `Inbox`
  so it stays visible.

The full-spec path also works: if the user hands you Kind/Area/Assignee/Priority
explicitly, use those verbatim and skip inference.

## Create it and set the fields

Resolve ids at runtime; do not hardcode them.

1. **Resolve the project and its options once:**
   - Project id: `gh project view 1 --owner getamourette --format json` → `.id`.
   - Field + option ids: `gh project field-list 1 --owner getamourette --format json`
     (each single-select field carries its `options[].id`).
2. **Create the item:**
   - Real issue: `gh issue create --repo getamourette/amourette-webapp --title "…"
     --body "…"` (the board auto-adds it to `Inbox`). Get its board item id with
     `gh project item-add 1 --owner getamourette --url <ISSUE_URL> --format json | jq -r .id`
     — this returns the id directly and is idempotent (re-adding an already-present
     issue returns the existing item), so it beats scanning `item-list`, whose default
     30-item limit and auto-add lag both routinely miss a just-created item.
   - Draft: `gh project item-create 1 --owner getamourette --title "…" --body "…"`
     (returns the item id).
3. **Set each inferred single-select field** (`Status`, `Kind`, `Area`, `Priority`) with
   `gh project item-edit --project-id <PROJECT_ID> --id <ITEM_ID>
   --field-id <FIELD_ID> --single-select-option-id <OPTION_ID>`.
4. **Set the `Assignee`** — it is the native GitHub assignee, not a single-select, so it
   takes a different path:
   - Real issue: `gh issue edit <N> --repo getamourette/amourette-webapp
     --add-assignee <login>` (propagates to the board's Assignee field).
   - Draft: resolve the draft's node id, then assign via GraphQL —
     `gh api graphql -f query='query($id:ID!){node(id:$id){... on ProjectV2Item{content{... on DraftIssue{id}}}}}' -f id=<ITEM_ID>`
     gives the draft id, then
     `gh api graphql -f query='mutation($d:ID!,$a:ID!){updateProjectV2DraftIssue(input:{draftIssueId:$d,assigneeIds:[$a]}){draftIssue{id}}}' -f d=<DRAFT_ID> -f a=<USER_NODE_ID>`.
   - Logins/node ids: `Marwane` = `marwaneazzouzi`, `Aymane` = `AymaneSghier` (resolve
     the node id with `gh api users/<login> --jq .node_id` if needed).

Confirm back with the item title, its Kind/Area (and Assignee/Priority if set), whether
it is a draft or issue #N, and the board link.

## Never

Never open a branch, write code, or run the gate — capture only. Never merge or move
another founder's item. Never invent Kind/Area values outside the fixed sets above.
