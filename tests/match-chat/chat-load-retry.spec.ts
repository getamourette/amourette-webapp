import { test, expect } from '@playwright/test';
import { mockNameUi, nameIds, nameUiState } from '../helpers/name-ui-fixture';
import { t } from '../../lib/strings';

// #486: a network failure while opening a chat is not "this chat is no longer
// available". The guest gets Retry, and the unsent messages are not purged.
const draftKey = `amourette-chat-delivery:${nameIds.alice}:${nameIds.match}`;
const draft = 'Still at the bar? I am by the window.';

for (const locale of ['en', 'fr'] as const) {
  const s = t[locale].chat;

  test(`a failed chat open offers Retry and keeps the unsent message (${locale})`, async ({ page }) => {
    await mockNameUi(page.context(), nameUiState(), 'alice', locale);
    await page.context().addInitScript(({ key, body, matchId, senderId }) => {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, JSON.stringify([{
        id: '00000000-0000-4000-8000-0000000000aa', match_id: matchId, sender_id: senderId,
        body, created_at: new Date().toISOString(), deliveryState: 'failed',
      }]));
    }, { key: draftKey, body: draft, matchId: nameIds.match, senderId: nameIds.alice });
    let failing = true;
    await page.route('**/rest/v1/rpc/chat_partner_state', route => failing
      ? route.fulfill({ status: 503, json: { message: 'Synthetic outage' } })
      : route.fallback());

    await page.goto(`/chat/${nameIds.match}`);
    await expect(page.getByRole('alert').filter({ hasText: s.loadFailed })).toBeVisible();
    await expect(page.getByText(s.unavailable, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(key => sessionStorage.getItem(key), draftKey)).toContain(draft);

    failing = false;
    await page.getByRole('button', { name: s.retry, exact: true }).click();
    await expect(page.getByTestId('chat-input')).toBeVisible();
    await expect(page.getByText(draft, { exact: true })).toBeVisible();
  });
}
