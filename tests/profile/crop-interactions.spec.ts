import sharp from 'sharp';
import { test, expect } from '@playwright/test';
import { mockPhotoOnboarding } from '../helpers/photo-onboarding-ui';
import { cropZoom, cropReady, setCropZoom } from '../helpers/photo-crop-ui';

test('portrait and round crop restore independently; cancellation and invalid files preserve the draft', async ({ context, page }) => {
  await mockPhotoOnboarding(context);
  const user = { name: 'CropDraft' };
  await page.goto('/profile');
  await page.getByPlaceholder('First name', { exact: true }).fill(user.name);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const buffer = await sharp({ create: { width: 1201, height: 801, channels: 3, background: '#98465b' } }).jpeg().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'photo.jpg',mimeType:'image/jpeg',buffer});
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: /^(Next|Confirm)$/ });
  await expect(confirm).toBeEnabled();
  await setCropZoom(dialog, 1.7);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(1, 2);
  // The round crop starts from the original bytes, not the portrait preview.
  await expect.poll(()=>dialog.locator('.reactEasyCrop_Image').evaluate(node=>[(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([1201,801]);
  await setCropZoom(dialog, 2.1);
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(1.7, 2);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await confirm.click();
  // Crop acceptance is the photo step's continue action.
  await expect(page.getByRole('group', { name: 'I am', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  const selected = await page.locator('[data-testid=photo-picker] img').getAttribute('src');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.locator('input[type=file]').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});
  await expect(page.locator('[data-testid=photo-picker] img')).toHaveAttribute('src',selected!);
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(1.7, 2);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(async()=>await cropZoom(dialog)).toBeCloseTo(2.1,2);
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await setCropZoom(dialog, 2);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(async()=>await cropZoom(dialog)).toBeCloseTo(2.1,2);
  await expect.poll(()=>dialog.locator('.reactEasyCrop_Image').evaluate(node=>[(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([1201,801]);
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await setCropZoom(dialog, 1);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(async()=>await cropZoom(dialog)).toBeCloseTo(2.1,2);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=photo-picker] img')).toHaveAttribute('src',selected!);
  await page.reload();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect.poll(() => cropZoom(dialog)).toBeCloseTo(1.7, 2);
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(async()=>await cropZoom(dialog)).toBeCloseTo(2.1,2);
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  // Resizing may change the rendered surface, never the selected source ratio.
  for (const viewport of [{width:320,height:568},{width:430,height:932},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await expect.poll(async()=>dialog.locator('.reactEasyCrop_CropArea').evaluate(node=>node.getBoundingClientRect().width/node.getBoundingClientRect().height)).toBeCloseTo(9/19.5,2);
    await expect(confirm).toBeInViewport();
  }
});


test('guided crop stages keep their proportions and bottom controls across locales', async ({ context, page }, testInfo) => {
  await mockPhotoOnboarding(context);
  await page.goto('/profile');
  await page.getByPlaceholder('First name', {exact:true}).fill('Portrait');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  const buffer = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer});
  const dialog = page.getByRole('dialog');
  for (const [locale, nextLabel, backLabel, confirmLabel] of [
    ['en', 'Next', 'Back', 'Confirm'], ['fr', 'Suivant', 'Retour', 'Valider'], ['es', 'Siguiente', 'Atrás', 'Confirmar'],
  ]) {
    await page.evaluate(locale => {localStorage.setItem('amourette-locale',locale);window.dispatchEvent(new Event('amourette-locale-change'));},locale);
    await page.setViewportSize({width:locale==='fr'?320:390,height:locale==='fr'?568:844});
    await cropReady(dialog);
    await expect(dialog.getByRole('slider')).toHaveCount(0);
    await expect(dialog.getByRole('button', {name: nextLabel, exact:true})).toBeInViewport();
    await expect(dialog.locator('header button')).toBeInViewport();
    await expect.poll(()=>dialog.evaluate(node=>node.scrollWidth)).toBe(page.viewportSize()!.width);
    await page.screenshot({path:testInfo.outputPath(`crop-${locale}.png`)});
    await dialog.getByRole('button',{name:nextLabel,exact:true}).click();
    await cropReady(dialog);
    await expect.poll(async()=>dialog.locator('.reactEasyCrop_CropArea').evaluate(node=>node.getBoundingClientRect().width/node.getBoundingClientRect().height)).toBeCloseTo(1,2);
    await expect(dialog.getByRole('button', {name: confirmLabel, exact:true})).toBeInViewport();
    await page.screenshot({path:testInfo.outputPath(`round-${locale}.png`)});
    await dialog.getByRole('button',{name:backLabel,exact:true}).click();
  }
});
