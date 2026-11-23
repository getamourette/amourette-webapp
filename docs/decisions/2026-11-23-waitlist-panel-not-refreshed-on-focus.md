# The admin waitlist is not refreshed when the window regains focus

Date: 2026-11-23 (#404)

The night page bumps one shared refresh revision on window focus and on tab
visibility, and every section used to be keyed on it. For the manual waitlist
that meant a full remount each time a founder came back from the mailbox, which
is exactly the moment they click "Mark Contacted": the list emptied, the page
scrolled, rows moved, and the click hit the section header or another entry.
The launch rehearsal recorded one entry reopened from closed to contacted this
way.

Decision: the waitlist panel keeps its rows across focus changes. It loads when
the Waitlist tab opens and when a founder presses "Refresh waitlist". It is not
refreshed in place in the background either, because a refresh in flight would
disable the buttons under the click that triggered it.

Why this is safe: every follow-up command sends the state the founder saw, and
the server refuses it if another founder changed the entry since. The refusal is
shown on the row and blocks further changes until a refresh, so stale rows can
cause a refused change, never a wrong one.

The Activity panel is read-only and keeps the previous behaviour.
