import { test, expect } from "../helpers/fixtures";

declare global {
  interface Window { emptyRoomSightings?: number }
}

// #385: the participant's own check-in invalidates the feed the bootstrap is
// loading. The room must wait for a settled read instead of opening on the
// empty state and swapping to the feed a moment later.
test("a first check-in into a live venue opens on the feed, never on the empty room", async ({ data, contextFor }) => {
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  await data.checkIn(venue, [bob]);

  const page = await (await contextFor(alice)).newPage();
  await page.addInitScript(() => {
    localStorage.setItem("amourette-room-hint-dismissed", "1");
    // A flash is shorter than any polling assertion: count every mutation
    // batch during which the empty room was in the document.
    window.emptyRoomSightings = 0;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="empty-live-room"]')) window.emptyRoomSightings! += 1;
    }).observe(document, { childList: true, subtree: true });
  });
  // The shared database can be slow: wait for the discovery response that
  // carries Bob before applying the UI deadline.
  const discovery = page.waitForResponse(async response => {
    if (new URL(response.url()).pathname !== "/rest/v1/rpc/room_candidates" || !response.ok()) return false;
    const rows: unknown = await response.json();
    return Array.isArray(rows) && rows.some(row => row && typeof row === "object" && "id" in row && row.id === bob.id);
  });
  await page.goto(`/v/${venue.slug}`);
  await discovery;

  await expect(page.getByRole("heading", { name: "Bob", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.emptyRoomSightings)).toBe(0);
});
