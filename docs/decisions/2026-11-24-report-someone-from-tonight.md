# "Report someone from tonight" lists only people the guest has already seen

Date: 2026-11-24 (#482)

A guest could lose every way to report: reporting was only offered on the card
on screen and in the chat, so a block (from either side), a departure, a hidden
profile or a pending correction on her own profile removed the button, while
`submit_report` would still accept the report.

Decision: the room menu and the hidden-profile screen carry a "Report someone
from tonight" entry that never depends on the feed or on a match. It lists the
people this guest has already been shown tonight (feed, matches, chat partner),
remembered on her device for the current night only, plus whoever is on screen
now. The block dialog also offers to send the same reason and note as a report.
A repeated report of the same person the same night is shown as "Already
reported", not as an error.

Why not a server list of everyone present tonight: it would show hidden guests
to anyone who opens the picker, which defeats hiding (a women-first safety
control), and it would show every guest to people outside their orientation
filter. The device list only repeats names the guest already saw, and the server
stays the only authority on who may be reported.

Accepted limits, to revisit after the first night:

- Someone the guest never saw in the app (outside her orientation filter, or seen
  only on another device) cannot be picked. The empty state tells her to go to a
  founder or the bar staff, and founders get a direct "Remove for tonight"
  action (#482, founder part).
- A stored name is not re-checked against later name moderation. It is shown only
  to the guest who already saw it, on her device, for that night.
- The one-report-per-person-per-night rule stays. An escalation note written in a
  second report is not appended to the existing case yet; the guest is told the
  founders already have it.
