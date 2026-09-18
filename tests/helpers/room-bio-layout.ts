import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';

export async function expectRoomBioLayout(page: Page, bio: string, name: string, testInfo: TestInfo) {
  const heading = page.getByTestId('room-profile-name');
  const paragraph = page.getByText(bio, { exact: true });
  await expect(heading).toHaveText('Bob');
  await expect(paragraph).toHaveText(bio);
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 375, 393]) {
    await page.setViewportSize({ width, height: 727 });
    for (const expanded of [false, true]) {
      const state = expanded ? 'expanded' : 'collapsed';
      await test.step(`${width}px ${state}: text wraps and the like button stays reachable`, async () => {
        if (expanded) await heading.click();
        await expect(paragraph).toHaveClass(expanded ? /whitespace-pre-line/ : /line-clamp-2/);
        const geometry = await paragraph.evaluate(el => {
          const box = el.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const textBox = range.getBoundingClientRect();
          const text = el.firstChild!;
          const splitWords = [...text.textContent!.matchAll(/\S+/g)].filter(match => {
            range.setStart(text, match.index);
            range.setEnd(text, match.index + match[0].length);
            return range.getClientRects().length > 1;
          }).map(match => match[0]);
          const buttonBox = el.closest('section')!.querySelector('button')!.getBoundingClientRect();
          return { width: el.clientWidth, scrollWidth: el.scrollWidth, height: box.height,
            lineHeight: parseFloat(getComputedStyle(el).lineHeight),
            textLeft: textBox.left, textRight: textBox.right, textBottom: textBox.bottom,
            left: box.left, right: box.right, bottom: box.bottom, splitWords,
            buttonTop: buttonBox.top, buttonBottom: buttonBox.bottom, viewportHeight: innerHeight };
        });
        await testInfo.attach(`room-${name}-${state}-${width}`, {
          body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png',
        });
        expect(geometry.scrollWidth, 'The bio must not require horizontal scrolling or clipping').toBeLessThanOrEqual(geometry.width);
        expect(geometry.textLeft).toBeGreaterThanOrEqual(geometry.left - 1);
        expect(geometry.textRight).toBeLessThanOrEqual(geometry.right + 1);
        if (expanded) {
          expect(geometry.height).toBeGreaterThan(geometry.lineHeight * 2);
          expect(geometry.textBottom, 'All lines of this bio must be visible when expanded').toBeLessThanOrEqual(geometry.bottom + 1);
          if (name === 'prose') expect(geometry.splitWords).toEqual([]);
        } else {
          expect(geometry.height, 'Keep the two-line preview').toBeCloseTo(geometry.lineHeight * 2, 0);
        }
        expect(geometry.buttonTop).toBeGreaterThan(geometry.bottom);
        expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.viewportHeight);
      });
    }
    await heading.click();
    await expect(paragraph).toHaveClass(/line-clamp-2/);
  }
}
