import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { test, expect, type TestData, type TestIdentity } from "../helpers/fixtures";

// SEC-005 (#368): a participant a founder removed for tonight can no longer read
// the person they matched with, while that person keeps a paused, readable chat.
const asUser = (data: TestData, user: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${user.session.access_token}` } },
});

test("a participant removed for tonight loses the chat; the partner keeps it paused", async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const venue = await data.venue();
  const alice = await data.identity("Alice", "woman");
  const bob = await data.identity("Bob", "man");
  const founder = await data.identity("Founder", "man");
  await data.checkIn(venue, [alice, bob]);
  const matchId = await data.match(venue, alice, bob);
  expect((await data.service.from("admins").insert({ user_id: founder.id })).error).toBeNull();
  expect((await data.service.from("messages").insert({ match_id: matchId, sender_id: alice.id, body: "See you at the bar" })).error).toBeNull();

  const alicePage = await (await contextFor(alice)).newPage();
  await alicePage.goto(`/chat/${matchId}`);
  await expect(alicePage.getByTestId("chat-input")).toBeVisible({ timeout: 30_000 });
  const bobPage = await (await contextFor(bob)).newPage();
  await bobPage.goto(`/chat/${matchId}`);
  await expect(bobPage.getByTestId("chat-message").filter({ hasText: "See you at the bar" })).toHaveCount(1);

  const removal = await asUser(data, founder).rpc("eject_from_venue", {
    p_profile_id: bob.id, p_venue_id: venue.id, p_reason: "harassment",
  });
  expect(removal.error).toBeNull();

  await test.step("the removed participant reads nothing about the match", async () => {
    const bobClient = asUser(data, bob);
    expect((await bobClient.from("matches").select("id").eq("id", matchId)).data).toEqual([]);
    expect((await bobClient.from("messages").select("id").eq("match_id", matchId)).data).toEqual([]);
    expect((await bobClient.from("profiles").select("id").eq("id", alice.id)).data).toEqual([]);
    expect((await bobClient.rpc("chat_partner_state", { p_match_id: matchId })).data).toEqual([]);
    expect((await bobClient.rpc("match_presence_state", { p_match_id: matchId })).error?.message).toBe("match not available");

    await bobPage.reload();
    await expect(bobPage.getByText("Couldn’t open this conversation.", { exact: true })).toBeVisible();
    await expect(bobPage.getByTestId("chat-message")).toHaveCount(0);
    await expect(bobPage.getByTestId("chat-input")).toHaveCount(0);
  });

  await test.step("the partner keeps the conversation, paused like after a departure", async () => {
    await expect(alicePage.getByTestId("chat-input")).toBeHidden({ timeout: 20_000 });
    await alicePage.reload();
    await expect(alicePage.getByTestId("chat-message").filter({ hasText: "See you at the bar" })).toHaveCount(1);
    await expect(alicePage.getByTestId("chat-input")).toBeHidden();
    await expect(alicePage.getByText("Couldn’t open this conversation.", { exact: true })).toHaveCount(0);
  });
});
