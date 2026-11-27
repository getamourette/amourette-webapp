import { readFileSync } from "node:fs";
import { test as mocked, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../../lib/database.types";
import { test as seeded } from "../helpers/fixtures";
import { mockNameUi, nameUiState } from "../helpers/name-ui-fixture";
import { expectNoTextOverflow, type OverflowAllowance } from "../helpers/text-overflow";
import { bookingStrings } from "../../lib/booking-strings";
import { emailPreferenceStrings } from "../../lib/email-preference-strings";
import { MATCHING_CONSENT_WORDING } from "../../lib/matching-consent";
import { t } from "../../lib/strings";

// #420: the main screens, in French and English, with the longest content the
// contracts accept. A new screen is added here in the pull request that creates
// it (docs/workflow.md, "Text overflow sweep").
const locales = ["fr", "en"] as const;

// The longest values the input contracts accept: 30 characters for a first
// name, 300 for a bio, 120 for a venue name.
const longName = "Jean-Baptiste-Alexandre-Maxime";
const unbrokenName = "Wolfeschlegelsteinhausenberger";
const longBio = "Toujours partante pour une conversation qui dure jusqu’à la fermeture, un dernier verre en terrasse et une playlist improvisée. "
  + "Dis-moi quel morceau tu réécoutes sans jamais te lasser, et je te dirai lequel me fait rester. "
  + "Anticonstitutionnellement, promis, je réponds toujours aux messages. À jeudi.";
const longVenue = "Le Grand Café des Rencontres Extraordinaires et des Conversations Interminables du Canal Saint-Martin, Paris Dixième, 75";
const longMessage = "Je suis au fond à gauche, près du piano, avec une veste verte et un verre de vin rouge. "
  + "Si tu ne me trouves pas, demande au barman, il sait où je suis: https://example.test/track/4uLU6hMCjMI75M1A2tKUQCsi7d1aUnLienTresLongSansAucuneCoupurePossible?si=9f2c41d0b7e84a1f";

// Intentional truncation or sideways scrolling. Keep this list short: every
// entry hides text from the founder, so each one states why that is wanted.
const allowed: OverflowAllowance[] = [
  { selector: ".truncate.font-label", kind: "clipped", reason: "Waiting room header: a long venue name ends with an ellipsis." },
  { selector: '[data-testid="room-venue-name"]', kind: "clipped", reason: "Room header: a long venue name ends with an ellipsis so it never pushes the end time or the live count away." },
  { selector: '[data-testid="room-profile-name"].line-clamp-2', kind: "clipped-lines", reason: "Room card: a very long first name keeps two lines." },
  { selector: '[data-testid="profile-feed"] p.line-clamp-2', kind: "clipped-lines", reason: "Room card: the bio preview keeps two lines; tapping the name shows the whole bio." },
  { selector: '[data-testid="feed-photo-preview"] .line-clamp-2', kind: "clipped-lines", reason: "Onboarding preview of the room card: same two-line name and bio." },
  { selector: '[data-testid="chat-profile-name"]', kind: "clipped", reason: "Chat header: a long first name ends with an ellipsis; the profile sheet shows it whole." },
  { selector: 'nav[aria-label="Admin"]', kind: "scrolls-sideways", reason: "Founder console sections scroll sideways on a phone, with a fade on the cut edge." },
  { selector: '[role="tablist"][aria-label="Night sections"]', kind: "scrolls-sideways", reason: "Founder night tabs scroll sideways on a phone, with a fade on the cut edge." },
];


for (const locale of locales) {
  const s = t[locale];
  const check = (page: Page, screen: string) => expectNoTextOverflow(page, screen, locale, allowed);

  mocked.describe(`participant entry screens (${locale})`, () => {
    mocked("landing for a new visitor", async ({ context, page }) => {
      await mockNameUi(context, nameUiState(), "alice", locale);
      await context.route("**/rest/v1/rpc/get_my_profile", route => route.fulfill({ json: null }));
      await page.goto("/");
      await expect(page.getByText(s.landing.promise, { exact: true })).toBeVisible();
      await check(page, "landing-new");
      await page.locator("footer").scrollIntoViewIfNeeded();
      await check(page, "landing-new-footer");
    });

    mocked("landing for a returning participant with a long name and bio", async ({ context, page }) => {
      await mockNameUi(context, { ...nameUiState(), name: longName, bio: longBio }, "alice", locale);
      await context.route("**/rest/v1/profile_private?*", route => route.fulfill({ json: { adult_confirmed_at: now } }));
      await page.goto("/");
      await expect(page.getByText(s.landing.welcomeBack, { exact: true })).toBeVisible();
      await expect(page.getByText(longBio, { exact: true })).toBeVisible();
      await check(page, "landing-returning");
    });

    mocked("onboarding, every step", async ({ context, page }) => {
      await mockNameUi(context, nameUiState(), "alice", locale);
      await context.route("**/rest/v1/profiles?*", route => route.fulfill({ json: null }));
      await page.goto("/profile");
      const next = page.getByRole("button", { name: s.profile.onb.continue, exact: true });
      await expect(page.getByPlaceholder(s.profile.firstName, { exact: true })).toBeVisible();
      await check(page, "onboarding-name-empty");
      await page.getByPlaceholder(s.profile.firstName, { exact: true }).fill(longName);
      await check(page, "onboarding-name");
      await next.click();
      await expect(page.getByRole("heading", { name: s.profile.onb.photoPrompt })).toBeVisible();
      await check(page, "onboarding-photo");
      await page.locator("input[type=file]").setInputFiles({
        name: "synthetic.png", mimeType: "image/png",
        buffer: await sharp("public/test-profiles/portrait-1.svg").png().toBuffer(),
      });
      const crop = page.getByRole("dialog");
      await expect(crop.getByRole("button", { name: s.profile.crop.next, exact: true })).toBeVisible();
      await check(page, "onboarding-crop");
      await crop.getByRole("button", { name: s.profile.crop.next, exact: true }).click();
      await expect(crop.getByRole("button", { name: s.profile.crop.usePhoto, exact: true })).toBeVisible();
      await check(page, "onboarding-crop-preview");
      await crop.getByRole("button", { name: s.profile.crop.usePhoto, exact: true }).click();
      const gender = page.getByRole("group", { name: s.profile.iAm, exact: true });
      await expect(gender).toBeVisible();
      await check(page, "onboarding-gender");
      await gender.getByRole("button", { name: s.genders.woman, exact: true }).click();
      const interests = page.getByRole("group", { name: s.profile.iWantToMeet, exact: true });
      await expect(interests).toBeVisible();
      await interests.getByRole("button", { name: s.genders.man, exact: true }).click();
      await check(page, "onboarding-interests");
      await next.click();
      await page.getByRole("textbox", { name: s.profile.bioOptional }).fill(longBio);
      await check(page, "onboarding-bio");
      await next.click();
      await expect(page.getByRole("checkbox", { name: MATCHING_CONSENT_WORDING[locale] })).toBeVisible();
      await check(page, "onboarding-consent");
      // #485: a busy photo converter at the door, retried and then given up.
      await page.route("**/api/profile-photo/upload", route => route.fulfill({ json: { path: "staged.png", token: "test-token", ticket: "test-ticket" } }));
      await page.route("**/storage/v1/object/upload/sign/profile-photo-staging/**", route => route.fulfill({ json: { Key: "staged" } }));
      await page.route("**/api/profile-photo", route => route.fulfill({ status: 503, json: { error: "converter_busy" } }));
      for (const box of await page.getByTestId("onboarding-confirmation").getByRole("checkbox").all()) await box.check();
      await page.getByRole("button", { name: s.profile.save, exact: true }).click();
      await expect(page.getByText(s.profile.photoBusyRetrying, { exact: true })).toBeVisible();
      await check(page, "onboarding-consent-busy-retrying");
      await expect(page.getByText(s.profile.photoBusy, { exact: true })).toBeVisible({ timeout: 20_000 });
      await check(page, "onboarding-consent-busy");
    });

    mocked("onboarding, restoring a HEIC draft the browser cannot preview", async ({ context, page }) => {
      await mockNameUi(context, nameUiState(), "alice", locale);
      await context.route("**/rest/v1/profiles?*", route => route.fulfill({ json: null }));
      await page.route("**/api/profile-photo/prepare", async route => {
        if (!route.request().postDataJSON().ticket) return route.fulfill({ json: { path: "draft.heic", token: "test-token", ticket: "test-ticket" } });
        await new Promise(() => undefined); // Held: the status stays on screen.
      });
      await page.goto("/profile");
      await expect(page.getByPlaceholder(s.profile.firstName, { exact: true })).toBeVisible();
      await page.evaluate(async bytes => {
        const raw = Object.keys(localStorage).find(key => key.endsWith("-auth-token"));
        const userId: string = JSON.parse(localStorage.getItem(raw!)!).user.id;
        const db = await new Promise<IDBDatabase>(resolve => {
          const request = indexedDB.open("amourette-onboarding", 1);
          request.onupgradeneeded = () => request.result.createObjectStore("photo-drafts", { keyPath: "userId" });
          request.onsuccess = () => resolve(request.result);
        });
        await new Promise<void>(resolve => {
          const transaction = db.transaction("photo-drafts", "readwrite");
          transaction.objectStore("photo-drafts").put({ userId, bytes: new Uint8Array(bytes).buffer, name: "draft.heic", type: "image/heic", lastModified: 1, savedAt: Date.now() });
          transaction.oncomplete = () => resolve();
        });
        db.close();
      }, [...readFileSync("tests/fixtures/heic/p3-10.heic")]);
      await page.reload();
      await expect(page.getByText(s.profile.photoRestoring, { exact: true })).toBeVisible();
      await check(page, "onboarding-restoring-photo");
    });

    mocked("profile editor with a long name and bio", async ({ context, page }) => {
      await mockNameUi(context, { ...nameUiState(), name: longName, bio: longBio }, "alice", locale);
      await page.goto("/profile?edit=1");
      await expect(page.getByRole("textbox", { name: s.profile.bioOptional })).toHaveValue(longBio);
      await check(page, "profile-edit");
      await page.getByRole("textbox", { name: s.profile.bioOptional }).scrollIntoViewIfNeeded();
      await check(page, "profile-edit-bio");
    });

    // lib/email-preference-strings.ts is a copy-exempt dictionary: its screens are swept too.
    mocked("email preferences and unsubscribe pages", async ({ context, page }) => {
      await mockNameUi(context, nameUiState(), "alice", locale);
      const email = emailPreferenceStrings[locale];
      await page.goto("/email-preferences");
      await expect(page.getByPlaceholder(email.emailPlaceholder, { exact: true })).toBeVisible();
      await check(page, "email-preferences");
      await page.goto(`/unsubscribe?lang=${locale}`);
      await expect(page.getByRole("heading", { level: 1, name: email.publicTitle })).toBeVisible();
      await check(page, "unsubscribe");
    });

    mocked("reservation form for a venue with a long name and address", async ({ page }) => {
      await mockReservation(page);
      await page.goto(`/events/${nightId}`);
      await expect(page.getByRole("heading", { name: longVenue })).toBeVisible();
      await page.getByRole("button", { name: { en: "English", fr: "Français" }[locale], exact: true }).click();
      await expect(page.getByLabel(bookingStrings[locale].name, { exact: true })).toBeVisible();
      await check(page, "reservation-form");
      await page.getByLabel(bookingStrings[locale].name, { exact: true }).scrollIntoViewIfNeeded();
      await check(page, "reservation-form-fields");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await check(page, "reservation-form-end");
    });
  });

  seeded(`room and chat with long names, bios and messages (${locale})`, async ({ data, contextFor }) => {
    seeded.setTimeout(180_000);
    const venue = await data.venue();
    const renamed = await data.service.from("venues").update({ name: longVenue }).eq("id", venue.id);
    expect(renamed.error).toBeNull();
    const alice = await data.identity(longName, "woman");
    const bob = await data.identity(unbrokenName, "man");
    // The service role cannot edit a profile: each participant writes their own bio.
    for (const { id, session } of [alice, bob]) {
      const own = createClient<Database>(data.env.url, data.env.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      });
      const saved = await own.from("profiles").update({ bio: longBio }).eq("id", id);
      expect(saved.error).toBeNull();
    }
    await data.checkIn(venue, [alice, bob]);
    const context = await contextFor(alice);
    // The fixture stores "en" in the storage state, which is applied before any init script.
    await context.addInitScript(value => {
      localStorage.setItem("amourette-locale", value);
      localStorage.setItem("amourette-room-hint-dismissed", "1");
    }, locale);
    const page = await context.newPage();

    // The shared database can be slow: wait for the read that carries the other
    // participant before applying the UI deadline (docs/workflow.md, #337).
    const discovery = page.waitForResponse(async response => {
      if (new URL(response.url()).pathname !== "/rest/v1/rpc/room_candidates" || !response.ok()) return false;
      const rows: unknown = await response.json();
      return Array.isArray(rows) && rows.some(row => row && typeof row === "object" && "id" in row && row.id === bob.id);
    }, { timeout: 60_000 });
    await page.goto(`/v/${venue.slug}`);
    await discovery;
    const name = page.getByTestId("room-profile-name");
    await expect(name).toHaveText(unbrokenName);
    await check(page, "room-feed");
    await name.click();
    await expect(page.getByText(longBio, { exact: true })).toHaveClass(/whitespace-pre-line/);
    await check(page, "room-card-expanded");
    await name.click();
    await page.getByRole("button", { name: s.room.roomActions }).click();
    await expect(page.locator("#room-overflow-menu")).toBeVisible();
    await check(page, "room-menu");
    // "Report someone from tonight" lists the long, unbroken name (#482).
    await page.locator("#room-overflow-menu").getByRole("button", { name: s.room.reportSomeone, exact: true }).click();
    const picker = page.getByRole("dialog", { name: s.room.reportSomeoneTitle });
    await expect(picker.getByRole("button", { name: s.room.reportSomeoneChoose(unbrokenName), exact: true })).toBeVisible();
    await check(page, "room-report-someone");
    await picker.getByRole("button", { name: s.room.reportCancel, exact: true }).click();
    await expect(picker).toHaveCount(0);

    const matchId = await data.match(venue, alice, bob);
    const sent = await data.service.from("messages").insert([
      { match_id: matchId, sender_id: bob.id, body: longMessage },
      { match_id: matchId, sender_id: alice.id, body: longMessage },
    ]);
    expect(sent.error).toBeNull();
    const thread = page.waitForResponse(response =>
      new URL(response.url()).pathname === "/rest/v1/messages" && response.request().method() === "GET" && response.ok(), { timeout: 60_000 });
    await page.goto(`/chat/${matchId}`);
    await thread;
    await expect(page.getByTestId("chat-message")).toHaveCount(2);
    await check(page, "chat-thread");
    await page.getByTestId("chat-profile-open").click();
    await expect(page.getByTestId("chat-profile-dialog")).toBeVisible();
    await check(page, "chat-profile");
  });
}

// The founder console has no French: it is swept once.
mocked.describe("founder night screens (en)", () => {
  mocked("nights home with long venue names", async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/admin");
    await expect(page.getByRole("region", { name: "Happening now" }).getByRole("heading", { name: longVenue })).toBeVisible();
    await expectNoTextOverflow(page, "admin-nights", "en", allowed);
  });

  mocked("tonight, remove someone, with a long participant name", async ({ page }) => {
    await mockAdmin(page);
    await page.goto(`/admin/tonight?night=${nightId}`);
    const section = page.getByRole("region", { name: "Remove someone" });
    await section.getByRole("button", { name: "Show participants", exact: true }).click();
    const name = "Maximiliano-Bartholomew-Constantinopolis";
    await expect(section.getByText(name, { exact: true })).toBeVisible();
    await section.getByRole("listitem").first().scrollIntoViewIfNeeded();
    await expectNoTextOverflow(page, "admin-tonight-remove", "en", allowed);
    await section.getByRole("button", { name: `Remove ${name} for tonight`, exact: true }).click();
    await expect(page.getByRole("dialog", { name: `Remove ${name} for tonight?` })).toBeVisible();
    await expectNoTextOverflow(page, "admin-tonight-remove-dialog", "en", allowed);
  });

  for (const tab of ["overview", "reservations"]) {
    mocked(`night page, ${tab} tab, with a long venue name`, async ({ page }) => {
      await mockAdmin(page);
      await page.goto(`/admin/nights/${nightId}?tab=${tab}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Reservations", exact: true })).toBeVisible();
      await expect(page.getByRole("status")).toHaveCount(0);
      await expectNoTextOverflow(page, `admin-night-${tab}`, "en", allowed);
      await page.getByRole("tablist").evaluate(tabs => tabs.scrollIntoView({ block: "start" }));
      await expectNoTextOverflow(page, `admin-night-${tab}-content`, "en", allowed);
    });
  }
});

const venueId = "00000000-0000-4000-8000-000000000010";
const nightId = "00000000-0000-4000-8000-000000000011";
const now = "2026-10-13T12:00:00Z";

async function bypassPreviewProtection(page: Page) {
  if (!process.env.E2E_BASE_URL || !process.env.E2E_VERCEL_BYPASS) return;
  const origin = new URL(process.env.E2E_BASE_URL).origin;
  await page.route(url => url.origin === origin, route => route.continue({
    headers: { ...route.request().headers(), "x-vercel-protection-bypass": process.env.E2E_VERCEL_BYPASS! },
  }));
}

// Same synthetic transport as tests/reservations/booking.spec.ts: nothing is
// booked or paid, and no request reaches a database.
async function mockReservation(page: Page) {
  await page.clock.setFixedTime(new Date(now));
  await bypassPreviewProtection(page);
  const event = {
    night_id: nightId, venue_name: longVenue, city: "Paris",
    address: "128 boulevard de la Rencontre-Inattendue-et-des-Conversations, 75010 Paris", timezone: "Europe/Paris", now,
    opens_at: "2026-10-12T12:00:00Z", closes_at: "2026-10-20T17:30:00Z", starts_at: "2026-10-20T18:00:00Z",
    ends_at: "2026-10-20T22:00:00Z", cancellation_deadline: "2026-10-18T18:00:00Z", amount_minor: 1000, currency: "eur",
    policy_version: "launch-v1", available: 1, status: "open", walk_ins_possible: false, registration_open: true,
  };
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", route => route.abort());
  await page.route("**/api/launch/**", route => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith("/checkout") && request.method() === "GET") return route.fulfill({ json: event });
    throw new Error(`Unexpected booking request: ${request.method()} ${request.url()}`);
  });
}

// Same synthetic transport as tests/admin/night-page.spec.ts and nights-home.spec.ts.
async function mockAdmin(page: Page) {
  await page.clock.setFixedTime(new Date(now));
  await bypassPreviewProtection(page);
  const venue = { id: venueId, name: longVenue, slug: "le-grand-cafe", city: "Paris", timezone: "Europe/Paris", is_test_venue: false };
  const night = {
    id: nightId, venue_id: venueId, waiting_opens_at: "2026-10-13T10:00:00Z", guaranteed_launch_at: "2026-10-13T13:00:00Z",
    closes_at: "2026-10-14T00:00:00Z", launch_threshold: 12, status: "live", opened_at: "2026-10-13T10:00:00Z",
    terminal_at: null, terminal_reason: null,
  };
  const launchEvent = {
    night_id: nightId, capacity: 40, deposit_minor: 1000, currency: "eur", policy_version: "launch-v1",
    registration_opens_at: "2026-10-12T10:00:00Z", cancelled_at: null, cancellation_reason: null,
  };
  await page.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(page.url()).host && url.pathname.startsWith("/_next/")) socket.connectToServer(); else socket.close();
  });
  await page.route("**/auth/v1/**", route => route.abort());
  await page.route("**/rest/v1/**", route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").at(-1)!;
    const reply = (json: unknown) => route.fulfill({ json });
    // The admin shell polls the open-report count on every screen (#475).
    if (endpoint === "admin_moderation_queue") return reply([]);
    if (endpoint === "admin_launch_mail_problems") return reply({ total: 0, items: [] });
    if (endpoint === "am_i_admin") return reply(true);
    if (endpoint === "venues") return reply([venue]);
    if (endpoint === "venue_nights") return reply(url.searchParams.has("venue_id") || url.searchParams.get("select")?.includes("venues!inner") ? [] : [night]);
    if (endpoint === "admin_venue_night_participant_counts") return reply([{ venue_night_id: nightId, participant_count: 18 }]);
    // #561: the night overview also reads the reservation-link totals.
    if (endpoint === "admin_launch_channel_counts") return reply({ street: 9, instagram: 12, venue_flyer: 3, venue_story: 2, unspecified: 1 });
    if (endpoint === "admin_launch_overview") return reply({ now, event: launchEvent, allocations: 31, finance: [], gender_counts: { woman: 14, man: 11, nonbinary: 1, unspecified: 0 } });
    if (endpoint === "admin_search_launch_reservations" || endpoint === "admin_launch_list") return reply([]);
    if (endpoint === "admin_launch_arrival_summary") return reply({ now, starts_at: "2026-10-13T18:00:00Z", ends_at: "2026-10-14T00:00:00Z", ended: false, cancelled: false, verified: 12, remaining: 19, absent: 0, cancelled_count: 0 });
    // "Remove someone" on Tonight (#482): one long unbroken name, one removed.
    if (endpoint === "admin_photo_queue") return reply([
      { profile_id: "00000000-0000-4000-8000-000000000021", first_name: "Maximiliano-Bartholomew-Constantinopolis", displayed_path: null, pending_path: null },
      { profile_id: "00000000-0000-4000-8000-000000000022", first_name: "Léa", displayed_path: null, pending_path: null },
    ]);
    if (endpoint === "venue_ejections") return reply([{ profile_id: "00000000-0000-4000-8000-000000000022" }]);
    throw new Error(`Unexpected backend request: ${endpoint}`);
  });
}
