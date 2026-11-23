# Proof by change type, and a founder card opening every pull request

Date: 2026-11-23 (#419, part of #427)

Each kind of change now has a stated proof (`AGENTS.md`, "Proof by change type"):
a failing-then-passing test for a logic, data, state or SQL bug; before/after
mobile captures in French and English for a purely visual change; a browser test
plus captures for a new journey; the test plus a runtime transcript for a
server-only change; the replay test, the existing-data check and what was not
applied for a migration; one real execution of the procedure for documentation or
agent instructions that prescribe one. Anything unverified is stated. A new kind
of change adds its line in the pull request that first needs it.

Every pull request description opens with a founder card of five lines in a fixed
order: What changes, Proof, Review, Risk, Your action. Your action is either
`Nothing, you can merge` or a `To test` block with the preview link, at most four
steps and what he should see. The rest of the description is Problem, Change,
Scope, Proof, Not verified. The `ship` skill writes the card on every pull
request; the format lives in `docs/workflow.md`, "Proof and the founder card".

*Why:* the founder is the only active reviewer and the bottleneck. He tested most
changes by hand and sometimes missed something, because pull requests said what
was run but nothing said what counted as proof, so the evidence varied. He reads
from T3 Code, mostly on a phone, and must know in 30 seconds what changes, what
proves it and what he has to do. A fixed order means he never searches for his
action. The card uses bold labels and plain paragraphs, no table and no HTML, so
it reads the same on GitHub and in the T3 Code pull request panel.

The Review line is reserved now and filled by the automatic review when it exists
(#421). Review remarks are handled by the authoring thread, at most two rounds; a
remaining disagreement is written on that line for the founder to decide.

A preview link only works from a browser signed in to a Vercel account that is a
member of the project's team: every `*.vercel.app` address is behind Vercel
Authentication. The repository is public, so a bypass secret or a shareable link
is never pasted in a pull request; when the founder cannot open previews, the
agent's captures are the proof.
