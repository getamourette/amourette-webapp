import type { SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Database } from '../../lib/database.types';
import { isRecord } from '../../lib/input-validation';
import { parseReviewProfile, parseOwnerReview } from '../../lib/profile-review-data';

export async function inspectedProfile(admin: SupabaseClient<Database>, venue: string, profile: string) {
  const result = await admin.rpc('admin_profile_reviews', { p_venue: venue, p_filter: 'all', p_limit: 50 });
  expect(result.error).toBeNull();
  if (!isRecord(result.data) || !Array.isArray(result.data.profiles)) throw new Error('Invalid review page');
  const row = result.data.profiles.map(parseReviewProfile).find(row => row.id === profile);
  if (!row) throw new Error('Profile missing from its authorized venue');
  return row;
}
export async function approveProfile(admin: SupabaseClient<Database>, venue: string, profile: string) {
  const review = await inspectedProfile(admin, venue, profile);
  expect((await admin.rpc('approve_profile_review', { p_profile: profile, p_venue: venue, p_revision: review.revision })).error).toBeNull();
}
export async function submitProfile(owner: SupabaseClient<Database>, profile: string) {
  const result = await owner.rpc('my_profile_review'); expect(result.error).toBeNull();
  const state = parseOwnerReview(result.data, profile);
  if (!state) throw new Error('No active correction to submit');
  expect(state.canSubmit).toBe(true);
  expect((await owner.rpc('submit_profile_review', { p_revision: state.revision })).error).toBeNull();
}
export async function selectReviewProfile(page: Page, venue: string, name: string) {
  const review = page.getByTestId('admin-profile-review');
  await review.getByRole('combobox', { name: 'Venue' }).selectOption(venue);
  await review.getByRole('button', { name: /^All profiles / }).click();
  await expect(review.getByRole('heading', { name: /^Profile \d+ of \d+$/ })).toBeVisible();
  // An approval in All advances, so restart the search at the first profile.
  const previous = review.getByRole('button', { name: 'Previous', exact: true });
  for (let index = 0; index < 50 && await previous.isEnabled(); index++) {
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/rpc/admin_profile_reviews')), previous.click()]);
    await expect(review.getByRole('heading', { name: /^Profile \d+ of \d+$/ })).toBeVisible();
  }
  for (let index = 0; index < 50; index++) {
    await expect(review.getByRole('heading', { name: /^Profile \d+ of \d+$/ })).toBeVisible();
    if (await review.getByText(name, { exact: true }).first().isVisible()) return review;
    const next = review.getByRole('button', { name: 'Next', exact: true });
    if (!await next.isEnabled()) break;
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/rpc/admin_profile_reviews')), next.click()]);
  }
  throw new Error('Profile missing from the review browser');
}
