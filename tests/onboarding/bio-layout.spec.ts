import { test, expect } from '../helpers/fixtures';

const examples = [
  { name: 'unbroken', bio: 'abcdefghij'.repeat(30) },
  { name: 'prose', bio: 'I love live music, quiet conversations and discovering a new place with friends. Tell me about the song you always want to hear again.' },
];

for (const { name, bio } of examples) {
  test(`returning home wraps the complete ${name} bio after creation at narrow mobile widths`, async ({ data, contextFor }, testInfo) => {
    const identity = await data.identity('Alice');
    const page = await (await contextFor(identity)).newPage();
    await page.goto('/profile');
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await page.getByPlaceholder('First name', { exact: true }).fill('Alice');
    await next.click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'bio-test.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64'),
    });
    await next.click();
    await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
    await next.click();
    await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
    await next.click();
    await page.getByRole('textbox', { name: 'Bio (optional)' }).fill(bio);
    await next.click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Join tonight', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.evaluate(() => {
      localStorage.setItem('amourette-locale', 'fr');
      window.dispatchEvent(new Event('amourette-locale-change'));
    });
    await expect(page.getByText('Content de te revoir', { exact: true })).toBeVisible();
    const paragraph = page.getByText(bio, { exact: true });
    await expect(paragraph).toHaveText(bio);
    await page.evaluate(() => document.fonts.ready);
    const saved = await data.service.from('profiles').select('bio').eq('id', identity.id).single();
    expect(saved.error).toBeNull();
    expect(saved.data?.bio).toBe(bio);

    for (const width of [320, 375, 393]) {
      await test.step(`${width}px: all text stays inside the padded card`, async () => {
        await page.setViewportSize({ width, height: 727 });
        const geometry = await paragraph.evaluate(element => {
          const card = element.closest('.night-card')!;
          const cardBox = card.getBoundingClientRect();
          const cardStyle = getComputedStyle(card);
          const paragraphBox = element.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element);
          const lines = Array.from(range.getClientRects());
          // Per-character rectangles detect clipping even when scrollWidth is hidden.
          const text = element.firstChild!;
          const characters = Array.from({ length: text.textContent!.length }, (_, index) => {
            range.setStart(text, index);
            range.setEnd(text, index + 1);
            const rect = range.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          });
          const splitWords = [...text.textContent!.matchAll(/\S+/g)].filter(match => {
            range.setStart(text, match.index);
            range.setEnd(text, match.index + match[0].length);
            return range.getClientRects().length > 1;
          }).map(match => match[0]);
          return {
            left: cardBox.left + parseFloat(cardStyle.borderLeftWidth) + parseFloat(cardStyle.paddingLeft),
            right: cardBox.right - parseFloat(cardStyle.borderRightWidth) - parseFloat(cardStyle.paddingRight),
            top: paragraphBox.top, bottom: paragraphBox.bottom,
            minTextLeft: Math.min(...characters.map(rect => rect.left)),
            maxTextRight: Math.max(...characters.map(rect => rect.right)),
            minTextTop: Math.min(...characters.map(rect => rect.top)),
            maxTextBottom: Math.max(...characters.map(rect => rect.bottom)),
            lineCount: new Set(lines.map(rect => rect.top)).size,
            splitWords,
            editTop: card.querySelector('a[href="/profile?edit=1"]')!.getBoundingClientRect().top,
            pageWidth: document.documentElement.scrollWidth,
          };
        });
        await testInfo.attach(`${name}-${width}`, {
          body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
          contentType: 'image/png',
        });
        expect(geometry.minTextLeft, 'First rendered character must respect card padding').toBeGreaterThanOrEqual(geometry.left - 1);
        expect(geometry.maxTextRight, 'Last rendered character must respect card padding').toBeLessThanOrEqual(geometry.right + 1);
        expect(geometry.minTextTop).toBeGreaterThanOrEqual(geometry.top - 1);
        expect(geometry.maxTextBottom, 'Every line must fit without vertical clipping').toBeLessThanOrEqual(geometry.bottom + 1);
        expect(geometry.lineCount).toBeGreaterThan(1);
        expect(geometry.editTop).toBeGreaterThan(geometry.maxTextBottom);
        expect(geometry.pageWidth).toBeLessThanOrEqual(width);
        if (name === 'prose') expect(geometry.splitWords, 'Ordinary words should wrap at spaces').toEqual([]);
      });
    }
  });
}
