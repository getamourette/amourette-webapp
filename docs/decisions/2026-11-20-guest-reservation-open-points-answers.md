# Guest reservation pages: Marwane's answers on the open points

Date: 2026-11-20 (#405)

- **The automatic opening of the email link stays (2), and a used link keeps
  reopening the reservation for seven days (10).** Why: the second is what makes
  the first safe, and it lets a guest reopen the reservation from the email at
  the door.
- **"Check current reservation" only reads the state (9).** After an uncertain
  cancellation it no longer reopens the confirmation, which read like a second
  cancel prompt. A reservation that is still active says so; the guest starts
  the cancellation again deliberately.
- **A superseded link gets its own message (11), in a separate PR.** It needs a
  server change so that only a holder of a proof that was really issued learns
  it was replaced.
- **"Non-binary" stays (16); the three gender choices share one row** as a
  segmented control instead of two rows of radio boxes.
- **The saved-attempt prompt on a new attempt in the same tab stays (18).**
- **The shorter privacy line and waitlist confirmation are approved.**
- **Refusals stay inline and persistent, not timed pop-ups, but are made
  unmissable:** a filled block with an icon and a short entrance, just above the
  action, scrolled into view, with the control to correct outlined. Why not a
  toast: a message that disappears on a timer is missed by a guest looking at
  the keyboard and cannot be reread.
