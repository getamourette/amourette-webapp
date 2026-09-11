import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "../../lib/database.types";
import { test, expect } from "../helpers/fixtures";

async function dismissPrimer(page: Page) {
  const primer = page.getByRole("dialog").filter({ has: page.locator("#room-hint-title") });
  await expect(primer).toBeVisible();
  await primer.getByRole("button").click();
}

test("a new participant joins, likes discreetly, matches and exchanges a message", async ({ data, contextFor }) => {
  test.setTimeout(180_000);
  const venue = await data.venue();
  // Auth exists, but Alice has no profile or presence: the UI must create both.
  const aliceIdentity = await data.identity("Alice");
  const bobIdentity = await data.identity("Bob", "man");
  const alice = await (await contextFor(aliceIdentity)).newPage();
  const bob = await (await contextFor(bobIdentity)).newPage();
  const roomPath = `/v/${venue.slug}`;

  await test.step("arrival creates a profile and checks into the scanned venue", async () => {
    await bob.goto(roomPath);
    await alice.goto(roomPath);
    await expect(alice).toHaveURL(new RegExp(`/profile\\?venue=${venue.slug}$`));
    const next = alice.getByRole("button", { name: "Continue", exact: true });
    await expect(next).toBeDisabled();
    await alice.getByPlaceholder("First name", { exact: true }).fill("Alice");
    await next.click();
    await expect(next).toBeDisabled();
    // A tiny synthetic PNG exercises real Storage upload; paid AI review is off.
    await alice.locator('input[type="file"]').setInputFiles({
      name: "e2e-profile.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=", "base64"),
    });
    await next.click();
    await alice.getByRole("group", { name: "I am", exact: true }).getByRole("button", { name: "Woman", exact: true }).click();
    await next.click();
    await alice.getByRole("group", { name: "I’d like to meet", exact: true }).getByRole("button", { name: "Man", exact: true }).click();
    await next.click();
    await alice.getByPlaceholder("Bio (optional)").fill("Here for a real conversation.");
    await next.click();
    const enter = alice.getByRole("button", { name: "Join tonight", exact: true });
    await expect(enter).toBeDisabled();
    await alice.getByRole("checkbox", { name: "I confirm that I am 18 or older." }).check();
    await enter.click();
    await expect(alice).toHaveURL(new RegExp(`${roomPath}$`));
    await dismissPrimer(alice);
    await dismissPrimer(bob);
    await expect(alice.getByRole("heading", { name: "Bob", exact: true })).toBeVisible();
    await expect(bob.getByRole("heading", { name: "Alice", exact: true })).toBeVisible();
    const { data: presence, error } = await data.service.from("presence")
      .select("profile_id").eq("venue_night_id", venue.nightId).is("left_at", null);
    expect(error).toBeNull();
    expect(presence?.map((row) => row.profile_id).sort()).toEqual([aliceIdentity.id, bobIdentity.id].sort());
  });

  await test.step("a one-sided like is durable but invisible to its recipient", async () => {
    await alice.getByRole("button", { name: "Like", exact: true }).click();
    await expect(alice.getByRole("button", { name: "Unlike Bob" })).toBeEnabled();
    const { count, error } = await data.service.from("likes")
      .select("id", { count: "exact", head: true }).eq("venue_night_id", venue.nightId)
      .eq("liker_id", aliceIdentity.id).eq("liked_id", bobIdentity.id);
    expect(error).toBeNull();
    expect(count).toBe(1);

    // Check the trusted boundary as Bob, not with the fixture administrator.
    const bobClient = createClient<Database>(data.env.url, data.env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bobIdentity.session.access_token}` } },
    });
    const likes = await bobClient.from("likes").select("id").eq("venue_night_id", venue.nightId);
    expect(likes.error).toBeNull();
    expect(likes.data).toEqual([]);
    const matches = await bobClient.from("matches").select("id").eq("venue_night_id", venue.nightId);
    expect(matches.error).toBeNull();
    expect(matches.data).toEqual([]);
    const message = await bobClient.from("messages").insert({
      match_id: randomUUID(), sender_id: bobIdentity.id, body: "No match, no message",
    });
    expect(message.error).not.toBeNull();
    await bob.reload();
    await expect(bob.getByRole("heading", { name: "Alice", exact: true })).toBeVisible();
    await expect(bob.getByRole("button", { name: "Like", exact: true })).toBeEnabled();
    await expect(bob.getByRole("heading", { name: "The feeling’s mutual." })).toHaveCount(0);
    await expect(bob.getByTestId("match-stack")).toHaveCount(0);
  });

  await test.step("reciprocity reveals the match and unlocks the same chat for both people", async () => {
    await bob.getByRole("button", { name: "Like", exact: true }).click();
    for (const page of [alice, bob]) {
      await expect(page.getByRole("heading", { name: "The feeling’s mutual.", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Write a message", exact: true }).click();
      await expect(page.getByTestId("chat-input")).toBeVisible();
    }
    expect(alice.url()).toBe(bob.url());
    await alice.getByTestId("chat-input").fill("Meet by the bar?");
    await alice.getByTestId("chat-send").click();
    for (const page of [alice, bob]) {
      const message = page.getByTestId("chat-message").filter({ hasText: "Meet by the bar?" });
      await expect(message).toHaveCount(1);
      await expect(message).toHaveAttribute("data-delivery-state", "confirmed");
    }
  });
});
