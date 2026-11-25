import { test, expect, type Locator, type Page } from '@playwright/test';
import { newRoom, openRoom } from '../helpers/room-mock';
import { t } from '../../lib/strings';

// #483 (Z6-I4): on a 320 px screen with page zoom, the Report, Block and Leave
// dialogs are taller than the viewport. Each one must scroll inside it, so the
// confirm and cancel buttons can always be reached.
test.use({ viewport: { width: 320, height: 460 } });
const s = t.fr.room;

async function reachable(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport({ ratio: 0.99 });
}

async function fromMenu(page: Page, action: string) {
  await page.getByRole('button', { name: s.roomActions, exact: true }).click();
  await page.locator('#room-overflow-menu').getByRole('button', { name: action, exact: true }).click();
}

test('Report, Block and Leave keep confirm and cancel reachable at 320x460 in French', async ({ page }) => {
  await openRoom(page, newRoom(), 'fr');

  await fromMenu(page, s.block);
  const block = page.getByRole('dialog', { name: s.blockTitle('Bob') });
  // The optional reason makes the dialog its tallest.
  await block.getByRole('button', { name: s.blockReasonOptional, exact: true }).click();
  await reachable(block.getByRole('button', { name: s.blockSubmit, exact: true }));
  await reachable(block.getByRole('button', { name: s.reportCancel, exact: true }));
  await reachable(block.getByRole('heading', { name: s.blockTitle('Bob') }));
  await block.getByRole('button', { name: s.reportCancel, exact: true }).click();
  await expect(block).toHaveCount(0);

  await fromMenu(page, s.report);
  const report = page.getByRole('dialog', { name: s.reportTitle('Bob') });
  await reachable(report.getByRole('button', { name: s.reportSubmit, exact: true }));
  await reachable(report.getByRole('button', { name: s.reportCancel, exact: true }));
  await report.getByRole('button', { name: s.reportCancel, exact: true }).click();
  await expect(report).toHaveCount(0);

  await fromMenu(page, s.leave);
  const leave = page.getByRole('dialog', { name: s.leaveConfirmTitle });
  await reachable(leave.getByRole('button', { name: s.leave, exact: true }));
  await reachable(leave.getByText(s.leaveStay, { exact: true }));
});
