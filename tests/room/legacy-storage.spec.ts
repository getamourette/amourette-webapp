import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/fixtures";
import { t } from "../../lib/strings";

// #48 / #58: browsers that used the app under its former name still hold
// `paramour-*` keys. Each one must keep its meaning on the current build, and
// the next write must move it to the `amourette-*` namespace.
test("legacy paramour-* browser keys keep working and migrate to amourette-*", async ({ data, contextFor }) => {
  test.setTimeout(180_000);
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  // Carol keeps the feed non-empty: the room hint only opens over profiles.
  const carol = await data.identity("Carol", "man");
  await data.checkIn(venue, [alice, bob, carol]);
  const matchId = await data.match(venue, alice, bob);
  const readAt = new Date(Date.now() - 60_000).toISOString();
  const { error: readError } = await data.service.from("messages").insert({
    id: randomUUID(), match_id: matchId, sender_id: bob.id, body: "already read", created_at: readAt,
  });
  expect(readError).toBeNull();

  const context = await contextFor(alice);
  const page = await context.newPage();
  // Seed the legacy state on the app origin before any application page runs.
  await page.goto("/robots.txt");
  await page.evaluate(({ matchId, readAt }) => {
    localStorage.removeItem("amourette-locale");
    // Spanish, so the legacy choice is distinguishable from the Paris venue's
    // French default and from the English browser.
    localStorage.setItem("paramour-locale", "es");
    localStorage.setItem("paramour-room-hint-dismissed", "1");
    localStorage.setItem(`paramour-chat-read:${matchId}`, readAt);
  }, { matchId, readAt });
  const es = t.es;

  await test.step("room: legacy language, dismissed hint and read marker hold", async () => {
    const { error } = await data.service.from("messages").insert({
      id: randomUUID(), match_id: matchId, sender_id: bob.id, body: "new since then", created_at: new Date().toISOString(),
    });
    expect(error).toBeNull();
    await page.goto(`/v/${venue.slug}`);
    await expect(page.getByTestId("profile-feed")).toBeVisible({ timeout: 30_000 });
    const matchLink = page.getByTestId("match-stack").getByRole("link", { name: es.room.openConversation("Bob") });
    await expect(matchLink).toBeVisible();
    // One unread, not two: the legacy marker covers the message read earlier.
    await expect(matchLink).toContainText("1");
    await expect(matchLink).not.toContainText("2");
    await expect(page.locator("#room-hint-title")).toHaveCount(0);
  });

  await test.step("chat: opening it writes the read marker under amourette-*", async () => {
    await page.goto(`/chat/${matchId}`);
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-message").filter({ hasText: "new since then" })).toHaveCount(1);
    await expect.poll(() => page.evaluate(id => [
      localStorage.getItem(`amourette-chat-read:${id}`) !== null,
      localStorage.getItem(`paramour-chat-read:${id}`),
    ], matchId)).toEqual([true, null]);
  });

  await test.step("chat: a pending message stored under paramour-* is restored and moved", async () => {
    const pendingId = randomUUID();
    await page.evaluate(({ key, row }) => sessionStorage.setItem(key, JSON.stringify([row])), {
      key: `paramour-chat-delivery:${alice.id}:${matchId}`,
      row: {
        id: pendingId, match_id: matchId, sender_id: alice.id, body: "written before the rename",
        created_at: new Date().toISOString(), deliveryState: "failed",
      },
    });
    await page.reload();
    const restored = page.getByTestId("chat-message").filter({ hasText: "written before the rename" });
    await expect(restored).toHaveAttribute("data-delivery-state", "failed");
    await expect.poll(() => page.evaluate(({ current, legacy }) => [
      sessionStorage.getItem(current)?.includes("written before the rename") ?? false,
      sessionStorage.getItem(legacy),
    ], { current: `amourette-chat-delivery:${alice.id}:${matchId}`, legacy: `paramour-chat-delivery:${alice.id}:${matchId}` }))
      .toEqual([true, null]);
    await restored.getByRole("button").click();
    await expect(restored).toHaveAttribute("data-delivery-state", "confirmed");
    const { count } = await data.service.from("messages").select("id", { count: "exact", head: true }).eq("id", pendingId);
    expect(count).toBe(1);
    await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), `amourette-chat-delivery:${alice.id}:${matchId}`)).toBeNull();
  });

  await test.step("home: choosing a language writes amourette-locale and drops the legacy key", async () => {
    // A signed-in guest gets the returning-guest home, whose header carries the
    // shared language selector (the anonymous landing footer is replaced).
    await page.goto("/");
    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect.poll(() => page.evaluate(() => [
      localStorage.getItem("amourette-locale"),
      localStorage.getItem("paramour-locale"),
    ])).toEqual(["en", null]);
  });
});
