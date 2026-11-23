# Door scan reasons come from the existing founder lookup, not a new SQL function

Date: 2026-11-23 (#403)

When a scanned reservation code is refused for the selected night, the arrivals
scanner repeats the existing read-only `admin_inspect_launch_arrival` lookup on the
same venue's other nights (at most 12, nearest in time first) and shows the reason
with that night's entry time: booked for another night, cancelled, or a night that
has ended. A network or server failure keeps its own "connection problem" message.

- **No migration.** The alternative was to make the lookup function return the
  reason itself. Why not: it changes a function on the shared database while the
  migration workflow is being rebuilt, for a result the client can already obtain.
  A founder may open any night of the venue, so the per-night lookup reveals
  nothing new.
- **Only the reason and the date are shown,** never the other night's guest record
  or a confirmation action. Why: the door needs one glance and a next step; opening
  a record for a night that is not selected invites confirming on the wrong night.
- **The fan-out is bounded to 12 nights.** Why: a guest at the wrong door almost
  always booked an adjacent date, and an unbounded loop would grow with the venue's
  history. Beyond that bound the scanner says no reservation matches this night,
  which stays true.
- **Revisit** if a venue runs many nights and wrong-night scans beyond the bound
  become real: a single SQL lookup by venue is then the cleaner shape.
