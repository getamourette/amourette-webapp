# Three kinds of migration, each with its own proof

Date: 2026-11-23 (#434)

Once the merge workflow of #434 is in service, the database is migrated before
the new code is deployed, so for a minute or two the code already live runs on
the new schema, and browser tabs opened earlier keep running it for longer. A
migration is therefore classified by what it can do to that code, by
`scripts/migration-kind.mjs`, and a pull request check enforces the proof.

1. **Additive** (new table, column, function, and anything done to an object
   the same migration creates): the live code cannot notice. Nothing is asked.
2. **Behaviour** (an existing function replaced with the same arguments, a
   grant, policy, trigger, constraint or default changed, data updated): may
   ship in the same pull request as its code. CI then runs the browser suite of
   `main` on the code of `main` with the new migrations ("Live code on the new
   schema"), and the required browser check fails without it.
3. **Removal** (a dropped or renamed object, a changed column type, changed
   function arguments, and every statement the classifier does not recognise):
   the pull request holds the migration only, so its own browser suite is the
   live code on the new schema; no application code still names the removed
   object; and the last use left `main` at least 24 hours earlier.

**Why three and not the two first agreed.** The first design had only "additive"
and "everything else in two pull requests, 24 hours apart". About 18 of the 30
most recent migrations replace an existing function, almost always together
with the code that needs it: the two-kind rule would have turned most database
work into a two-day sequence ten days before the first evening. Kind 2 proves
the actual worry, that the live code keeps working during the switch, without
that delay.

**Known limits, accepted.**

- The kind 2 proof is as wide as the browser suite of `main`. A journey without
  a browser test is not proven. A suite that pins the old behaviour fails; the
  change then goes in two pull requests like kind 3.
- The search for a removed object is a whole-word text search of `app`,
  `components`, `emails`, `lib` and `proxy.ts`. A column with a common name
  (`status`) finds unrelated lines and the check stays red; merging then needs
  the founder's explicit bypass.
- CI runs on an empty database. What a migration does to existing rows stays
  the author's "existing-data check" of the proof rule.
- The classifier is conservative, not complete. A defect that escapes it is
  handled by the escaped-defect rule: fix, then add the missing rule and test.

The check is in service from the merge of its pull request, before the merge
workflow exists. The same rules are sound while migrations are still applied by
hand.
