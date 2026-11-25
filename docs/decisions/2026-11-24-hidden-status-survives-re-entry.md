# A hidden guest stays hidden on every return into the same night

**Decision (#481).** When a guest has hidden her profile, every way back into
the same venue night keeps her hidden: "Join tonight" after leaving, the
automatic return after a founder pauses and reopens the night, a reload, or a
new scan of the venue QR. `check_in` copies `is_visible` from the caller's
latest presence row for that night when it opens a new one. Only she can make
herself visible again, with "Make my profile visible". A new night still starts
visible, as before; carrying the choice across nights is a separate question for
the founders.

**Why.** Visibility lived only on the presence row, and every new row defaulted
to visible, so a woman who hid to avoid someone reappeared in every compatible
feed within a second, without any action or message. That breaks the "Women
first" invariant and the purpose of invisible mode ("Invisible mode is a balanced
visibility pause" in `docs/decisions.md`). The rule is enforced in the check-in transaction itself: a
client-side update after check-in would leave a visible window, and the row is
only derived from her own history, so no other participant can reveal her.
