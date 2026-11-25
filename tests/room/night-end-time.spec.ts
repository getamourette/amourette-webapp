import { test, expect } from "../helpers/fixtures";
import { t } from "../../lib/strings";

// #483 (Z6-I2): every match and message is deleted at the night's `closes_at`,
// so the room header and the chat opener say when, in the venue's time zone.
test("the room header and the chat opener show the night's end time in venue time", async ({ data, contextFor }) => {
  test.setTimeout(180_000);
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [alice, bob]);
  // A known close, on the minute, two hours from now. Fixture venues are in Paris.
  const closesAt = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 60_000) * 60_000).toISOString();
  const { error: nightError } = await data.service.from("venue_nights").update({ closes_at: closesAt }).eq("id", venue.nightId);
  expect(nightError).toBeNull();
  const matchId = await data.match(venue, alice, bob);
  const { error: matchError } = await data.service.from("matches").update({ expires_at: closesAt }).eq("id", matchId);
  expect(matchError).toBeNull();
  const parisTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(closesAt));
  expect(parisTime).toMatch(/^\d\d:\d\d$/);

  const context = await contextFor(alice);
  await context.addInitScript(() => localStorage.setItem("amourette-room-hint-dismissed", "1"));
  const page = await context.newPage();
  for (const locale of ["en", "fr"] as const) {
    await page.goto("about:blank");
    await context.addInitScript(value => localStorage.setItem("amourette-locale", value), locale);
    const s = t[locale];

    // The night state read carries `closes_at`; start the UI deadline after it (#337).
    const stateRead = page.waitForResponse(r => r.url().includes("/rpc/venue_night_state") && r.ok(), { timeout: 30_000 });
    await page.goto(`/v/${venue.slug}`);
    await stateRead;
    await expect(page.getByTestId("room-night-end")).toHaveText(`· ${s.room.nightEnd(parisTime)}`);

    const matchRead = page.waitForResponse(r => r.url().includes("/rest/v1/matches") && r.ok(), { timeout: 30_000 });
    await page.goto(`/chat/${matchId}`);
    await matchRead;
    await expect(page.getByTestId("chat-opener-note")).toHaveText(s.chat.openerNoteUntil(parisTime));
  }
});
