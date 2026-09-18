import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/database.types';
import { test, expect } from '../helpers/fixtures';

for (const [name, bio] of [
  ['unbroken', 'abcdefghij'.repeat(30)],
  ['prose', 'I love live music, quiet conversations and discovering a new place with friends. Tell me about the song you always want to hear again.'],
]) {
  test(`room wraps the ${name} bio in its preview and expanded card`, async ({ data, contextFor }, testInfo) => {
    const venue = await data.venue();
    const alice = await data.identity('Alice', 'woman');
    const bob = await data.identity('Bob', 'man');
    const bobClient = createClient<Database>(data.env.url, data.env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bob.session.access_token}` } },
    });
    const saved = await bobClient.from('profiles').update({ bio }).eq('id', bob.id);
    expect(saved.error).toBeNull();
    await data.checkIn(venue, [alice, bob]);
    const page = await (await contextFor(alice)).newPage();
    await page.goto(`/v/${venue.slug}`);
    const primer = page.getByRole('dialog').filter({ has: page.locator('#room-hint-title') });
    await expect(primer).toBeVisible();
    await primer.getByRole('button').click();
    const heading = page.getByTestId('room-profile-name');
    await expect(heading).toHaveText('Bob');
    const paragraph = page.getByText(bio, { exact: true });
    await expect(paragraph).toHaveText(bio);
    await page.evaluate(() => {
      localStorage.setItem('amourette-locale', 'fr');
      window.dispatchEvent(new Event('amourette-locale-change'));
    });
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
  });
}
