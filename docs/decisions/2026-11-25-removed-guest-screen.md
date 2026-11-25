# A guest removed for tonight sees a neutral screen, with no reason

**Decision (#517).** When `check_in` refuses a guest because a founder removed
them for tonight (`ejected from venue`), the room shows "You can no longer join
this night. If you have any questions, speak to the bar staff." It names no
reason, offers no join button, and does not retry on its own.

**Why.** The room treated that refusal as a technical failure ("Couldn't load
this page. Refresh the page to try again."), so a removed guest kept refreshing
and believed the app was broken. Naming the reason would hand them something to
argue with at the door and could expose who reported them; the staff on site is
the right place for that conversation.

**Accepted limits.** Participants cannot read their own removal (the
`venue_ejections` read policy is founders only), so the open room first shows
the ordinary "Back at the bar?" screen, and the neutral screen appears when they
try to join again. Showing it straight away would need a server read of the
caller's own removal, left for after the launch.
