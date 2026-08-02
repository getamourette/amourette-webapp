import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient, type Session } from "@supabase/supabase-js";
import { FIXTURE_PATH, loadTestEnv, serviceClient, type ChatFixture, type TestIdentity } from "./fixture";

const PHOTO = "https://api.dicebear.com/9.x/personas/svg?seed=";

export default async function globalSetup() {
  loadTestEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Chat tests need the public Supabase environment.");

  const service = serviceClient();
  const runId = randomUUID();
  const slug = `chat-e2e-${runId}`;
  if (slug.startsWith("test-")) throw new Error("Refusing to use a permanent QA room.");
  const userIds: string[] = [];
  let venueId: string | undefined;

  const createIdentity = async (name: string, gender: "woman" | "man") => {
    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session) throw error ?? new Error(`Could not create ${name}`);
    userIds.push(data.session.user.id);
    await service.auth.admin.updateUserById(data.session.user.id, {
      app_metadata: { chat_regression_run: runId },
    });
    const { error: profileError } = await service.from("profiles").insert({
      id: data.session.user.id,
      first_name: name,
      photo_url: `${PHOTO}${name}-${runId}`,
      gender,
      interested_in: ["woman", "man", "nonbinary"],
    });
    if (profileError) throw profileError;
    const { error: privateError } = await service.from("profile_private").insert({
      id: data.session.user.id,
      adult_confirmed_at: new Date().toISOString(),
    });
    if (privateError) throw privateError;
    return { id: data.session.user.id, name, session: data.session as Session } satisfies TestIdentity;
  };

  try {
    const [alice, bob, intruder, ...partners] = await Promise.all([
      createIdentity("Alice", "woman"),
      createIdentity("Bob", "man"),
      createIdentity("Eve", "woman"),
      createIdentity("Chloe", "woman"),
      createIdentity("Dario", "man"),
      createIdentity("Farah", "woman"),
    ]);
    const { data: venue, error: venueError } = await service
      .from("venues")
      .insert({ slug, name: `Chat regression ${runId.slice(0, 8)}`, city: "Paris", is_live: true })
      .select("id, slug")
      .single();
    if (venueError) throw venueError;
    venueId = venue.id;
    const now = Date.now();
    const { data: night, error: nightError } = await service
      .from("venue_nights")
      .insert({
        venue_id: venue.id,
        waiting_opens_at: new Date(now - 3_600_000).toISOString(),
        guaranteed_launch_at: new Date(now - 1_800_000).toISOString(),
        closes_at: new Date(now + 3_600_000).toISOString(),
        launch_threshold: 2,
        status: "live",
        opened_at: new Date(now - 3_600_000).toISOString(),
        launched_at: new Date(now - 1_800_000).toISOString(),
        launch_reason: "threshold",
      })
      .select("id")
      .single();
    if (nightError) throw nightError;
    const presenceRows = [alice, bob, intruder, ...partners].map((identity) => ({
      profile_id: identity.id,
      venue_id: venue.id,
      venue_night_id: night.id,
      is_visible: true,
    }));
    const { error: presenceError } = await service.from("presence").insert(presenceRows);
    if (presenceError) throw presenceError;
    const ordered = [alice.id, bob.id].sort();
    const { data: match, error: matchError } = await service
      .from("matches")
      .insert({
        profile_a: ordered[0],
        profile_b: ordered[1],
        venue_id: venue.id,
        venue_night_id: night.id,
        expires_at: new Date(now + 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    if (matchError) throw matchError;
    const fixture: ChatFixture = {
      runId,
      venue,
      nightId: night.id,
      matchId: match.id,
      users: { alice, bob, intruder, partners },
    };
    await writeFile(FIXTURE_PATH, JSON.stringify(fixture), "utf8");
  } catch (error) {
    await cleanup(service, venueId, userIds);
    throw error;
  }

  return async () => cleanup(service, venueId, userIds);
}

async function cleanup(service: ReturnType<typeof serviceClient>, venueId: string | undefined, userIds: string[]) {
  if (venueId) {
    const { error } = await service.from("venues").delete().eq("id", venueId);
    if (error) console.error(`Could not delete temporary chat venue: ${error.message}`);
  }
  for (const id of userIds) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) console.error(`Could not delete temporary chat user ${id}: ${error.message}`);
  }
}
