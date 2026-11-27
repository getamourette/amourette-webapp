import { expect, type Page } from '@playwright/test';
import { mockNameUi, nameIds, nameUiState } from './name-ui-fixture';
import { t } from '../../lib/strings';

// A live room served entirely from mocks: Alice sees Bob, Charlie, Dana and
// Eve. Shared by the room specs that need no database (#473, #483).
export const now = new Date().toISOString();
export const night = {
  venue_night_id: nameIds.night, status: 'live', participant_count: 5, launch_threshold: 3,
  guaranteed_launch_at: now, closes_at: new Date(Date.now() + 3600000).toISOString(),
  terminal_reason: null, updated_at: now,
};
export const names = ['Bob', 'Charlie', 'Dana', 'Eve'];
export const ids = Object.fromEntries(names.map((name, index) => [name, `00000000-0000-4000-8000-00000000020${index}`]));
export const card = (first_name: string) => ({
  id: ids[first_name], first_name, bio: null, photo_url: null, checked_in_at: now,
  venue_night_id: nameIds.night, like_token: nameIds.match,
});

export type Room = {
  feed: string[]; reviewFails: boolean; photoCorrection: boolean; matchedWith: string | null;
  blocks: Array<Record<string, unknown>>; reports: Array<Record<string, unknown>>;
  // Requests by endpoint name answered 503 while the count is above zero (#486).
  failures?: Record<string, number>;
  nightStatus?: string;
};

export async function mockRoom(page: Page, room: Room, locale: 'en' | 'fr' | 'es' = 'en', options: { signedIn?: boolean } = {}) {
  const context = page.context();
  await mockNameUi(context, nameUiState(), 'alice', locale, options);
  await context.addInitScript(() => {
    localStorage.setItem('amourette-room-hint-dismissed', '1');
    sessionStorage.setItem('amourette-entered:test-bar', '1');
  });
  await context.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), name = url.pathname.split('/').at(-1);
    const rows = (values: unknown[]) => route.fulfill({ json: request.headers().accept?.includes('object+json') ? values[0] ?? null : values });
    if (name && (room.failures?.[name] ?? 0) > 0) {
      room.failures![name]--;
      return route.fulfill({ status: 503, json: { message: 'Synthetic outage' } });
    }
    if (name === 'my_profile_review') return room.reviewFails
      ? route.fulfill({ status: 503, json: { message: 'Synthetic review failure' } }) : route.fulfill({ json: null });
    if (name === 'venues' || name === 'venue_by_slug') return rows([{ id: nameIds.venue, name: 'Test bar', city: 'Paris', timezone: 'Europe/Paris' }]);
    if (name === 'venue_night_state' || name === 'venue_night_public_state') return rows([{ ...night, status: room.nightStatus ?? night.status }]);
    if (name === 'profile_private') return rows([{ adult_confirmed_at: now }]);
    if (name === 'presence') return rows([{ id: nameIds.admin, left_at: null, is_visible: true, venue_night_id: nameIds.night }]);
    if (name === 'photo_state') return rows([{ profile_id: nameIds.alice, displayed_id: null, pending_id: null,
      correction_required: room.photoCorrection, reason: null, last_action: null, last_reason: null, revision: 1, updated_at: now }]);
    if (name === 'likes' || name === 'messages') return rows([]);
    if (name === 'profiles') {
      const other = names.find(first => url.search.includes(ids[first]));
      if (other) return rows([card(other)]);
      return route.fallback();
    }
    if (name === 'matches') return rows(room.matchedWith ? [{ id: nameIds.match, profile_a: nameIds.alice,
      profile_b: ids[room.matchedWith], expires_at: night.closes_at, created_at: now }] : []);
    if (name === 'room_candidates') return rows(room.feed.filter(first => first !== room.matchedWith).map(card));
    if (name === 'write_like') {
      const command = request.postDataJSON() as { p_target_id: string; p_action: string };
      const target = names.find(first => ids[first] === command.p_target_id) ?? null;
      room.matchedWith = command.p_action === 'like' ? target : null;
      return rows([{ accepted: true, liked: command.p_action === 'like', match_id: room.matchedWith ? nameIds.match : null }]);
    }
    if (name === 'blocks') { room.blocks.push(request.postDataJSON()); return route.fulfill({ status: 201, json: null }); }
    if (name === 'submit_report') { room.reports.push(request.postDataJSON()); return route.fulfill({ json: null }); }
    if (name === 'record_room_arrival') return route.fulfill({ json: null });
    return route.fallback();
  });
}

export async function openRoom(page: Page, room: Room, locale: 'en' | 'fr' | 'es' = 'en') {
  await mockRoom(page, room, locale);
  await page.goto('/v/test-bar');
  const feed = page.getByTestId('profile-feed');
  await expect(feed.locator('section')).toHaveCount(room.feed.length);
  await expect(feed.getByRole('button', { name: t[locale].room.like, exact: true }).first()).toBeEnabled();
  return feed;
}

export const newRoom = (): Room => ({ feed: [...names], reviewFails: false, photoCorrection: false, matchedWith: null, blocks: [], reports: [] });

