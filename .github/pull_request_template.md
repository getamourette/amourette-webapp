<!--
Founder card: five lines, always in this order, read on a phone in 30 seconds.
Format and rules: docs/workflow.md, "Proof and the founder card".
Never name an AI assistant or model anywhere in this description.
-->

**What changes:** <!-- one sentence, from the user's side -->

**Proof:** <!-- real CI result on the latest commit (scope, and whether browser tests really ran); captures below when there is a visible surface -->

**Review:** <!-- "Hosted reviewer: …", "Local fallback (<why>): …" or "None: <reason>", then the verdict; "Pending" on a draft not yet reviewed -->

**Risk:** <!-- open with the lane printed by `node scripts/review-lane.mjs --local` ("Fast lane." or "Sensitive lane (<reasons>)."), then migration or not -->

**Your action:** <!-- "Nothing, click Merge when ready", or "To test" followed by the block below -->

<!-- To test block, only when the founder must test. Delete otherwise.
Preview: <link to the page to open, clickable from a phone>
1. <at most four numbered steps>
You should see: <what proves it works>
-->

<!-- Captures: mobile viewport, French and English. One pair per screen and language,
before on the left, after on the right; write "new" when there is no before.
A change about motion needs an animated GIF pair (docs/workflow.md, "Motion needs
an animated pair").
Delete this block when there is no visible surface.

### <Screen>, FR

| **BEFORE** | **AFTER** |
| --- | --- |
| ![before](<address>) | ![after](<address>) |
-->

## Problem

<!-- The concrete problem in a sentence or two. -->

Closes #

## Change

<!-- How this fixes it. -->

## Scope

<!-- What is deliberately not touched. -->

## Proof

<!-- The proof required for this kind of change (AGENTS.md, "Proof by change type"):
what was run and what was observed. Include the CI scope and run link, and when
they apply: the input contract update, server/database refusal coverage, and for a
migration the replay test, the existing-data check and what was not applied. -->

**Failing case:** <!-- Follow AGENTS.md, "Prove the failing case too": what was
seen failing, with its result. If the rule does not apply, say why. A failure mode
that could not be provoked goes here AND on the Risk line of the card. -->

## Not verified

<!-- Everything that could not be verified, stated explicitly. "Nothing" when that is true. -->
