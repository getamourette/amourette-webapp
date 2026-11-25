# A match reveal is remembered by the browser, not by the server

Date: 2026-11-24 (#479)

The room used to keep the ids of revealed matches only in memory and, at every
load, marked all existing matches as already revealed. The guest who liked first
therefore missed the reveal whenever the match landed while the room was not on
screen: in a chat, on the profile page, or after iOS reloaded the tab. That
contradicted the 2026-07-09 intent that a match landing while the phone is
locked keeps its reveal.

The room now stores the revealed match ids per participant in `localStorage`
(`amourette-revealed-matches:<user id>`, see `lib/revealed-matches.ts`). Every
match not in that list is revealed once the room is on screen, one at a time,
after the first-entry primer. If storage cannot be read, the old rule applies
and the matches present at load are treated as seen, so reveals never replay
on every load.

Why the browser and not a server `seen_at`:

- The anonymous session itself lives in that same browser storage. A browser
  that loses its storage loses the participant, so a server copy would not save
  a reveal anyone could still see.
- It needs no migration, no new RPC and no new grant one week before the first
  night, and a forged value can only suppress or repeat its owner's own reveal.
- A server field remains the path if participants ever get durable accounts on
  several devices.

Test fixtures follow the same rule: a match created with `data.match` stands for
one its participants have already seen, so browsers opened for them start with
it recorded. Only a match created during a test is revealed.
