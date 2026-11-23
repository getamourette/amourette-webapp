# Overflowing text fails CI, and copy-only changes run that check

Date: 2026-11-23 (#420, part of #427)

- **A geometry check, not image comparison.** A Playwright helper reads the
  position of every rendered word and fails when the page scrolls sideways or a
  word leaves the viewport, its box or a clipping ancestor. Why: it needs no
  reference image, so it does not break on every intended visual change, and the
  message names the text and the element. Pixel-diff visual regression stays out
  of scope unless this proves insufficient.
- **Truncation is opt-in, in one list.** An ellipsis or a line clamp is reported
  like any other clipped text unless the sweep's `allowed` list names the
  clipping element, the kind of finding and a reason. Why: a CSS `truncate` class would otherwise silence the exact defect
  the check exists for, a French label cut in a button.
- **Copy-only changes now start one browser job that runs only the sweep.** They
  used to run no browser test. Why: a longer string is the usual cause of an
  overflow and changes no behavior that another journey would notice. Cost: one
  runner for a few minutes on a copy-only pull request. This amends the copy row
  of the CI scope table in `docs/workflow.md`.
- **Participant entry screens, the reservation form and the founder console use
  a synthetic backend; room and chat use real fixtures.** Why: the first group
  already has maintained mocks and needs no accounts; room and chat depend on
  authorization and discovery reads that a mock would only imitate.
- **The captures are a plain CI artifact, kept seven days.** Failure traces stay
  encrypted because they hold tokens; these captures show fixture data only. The
  artifact is where captures come from; a pull request with a visible change
  still embeds its pairs in the description.
