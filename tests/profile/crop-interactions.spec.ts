import sharp from 'sharp';
import { test, expect } from '../helpers/fixtures';

test('portrait and round crop restore independently; cancellation and invalid files preserve the draft', async ({ data, contextFor }) => {
  const user = await data.identity('CropDraft');
  const page = await (await contextFor(user)).newPage();
  await page.goto('/profile');
  await page.getByPlaceholder('First name', { exact: true }).fill(user.name);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const buffer = await sharp({ create: { width: 1201, height: 801, channels: 3, background: '#98465b' } }).jpeg().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'photo.jpg',mimeType:'image/jpeg',buffer});
  const dialog = page.getByRole('dialog');
  const zoom = dialog.getByRole('slider', { name: 'Zoom' });
  const confirm = dialog.getByRole('button', { name: 'Confirm crop', exact: true });
  await expect(confirm).toBeEnabled();
  await zoom.fill('1.7');
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await expect(zoom).toHaveValue('1');
  // The round crop starts from the original bytes, not the portrait preview.
  await expect.poll(()=>dialog.locator('.reactEasyCrop_Image').evaluate(node=>[(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([1201,801]);
  await zoom.fill('2.1');
  await dialog.getByRole('button', { name: 'Your feed photo', exact: true }).click();
  await expect(zoom).toHaveValue('1.7');
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(dialog.getByTestId('feed-photo-preview')).toBeVisible();
  await confirm.click();
  // Crop acceptance is the photo step's continue action.
  await expect(page.getByRole('group', { name: 'I am', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  const selected = await page.locator('label img').getAttribute('src');
  await page.locator('input[type=file]').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});
  await expect(page.locator('label img')).toHaveAttribute('src',selected!);
  await page.getByRole('button', { name: 'Recrop', exact: true }).click();
  await expect(zoom).toHaveValue('1.7');
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await expect.poll(async()=>Number(await zoom.inputValue())).toBeCloseTo(2.1,2);
  await dialog.getByRole('button', { name: 'Your feed photo', exact: true }).click();
  await zoom.fill('2');
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await expect.poll(async()=>Number(await zoom.inputValue())).toBeCloseTo(2.1,2);
  await expect.poll(()=>dialog.locator('.reactEasyCrop_Image').evaluate(node=>[(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([1201,801]);
  await dialog.getByRole('button', { name: 'Your feed photo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reset', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await expect.poll(async()=>Number(await zoom.inputValue())).toBeCloseTo(2.1,2);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('label img')).toHaveAttribute('src',selected!);
  await page.reload();
  await page.getByRole('button', { name: 'Recrop', exact: true }).click();
  await expect(zoom).toHaveValue('1.7');
  await dialog.getByRole('button', { name: 'Edit this crop', exact: true }).click();
  await expect.poll(async()=>Number(await zoom.inputValue())).toBeCloseTo(2.1,2);
  await dialog.getByRole('button', { name: 'Your feed photo', exact: true }).click();
  // Resizing may change the rendered surface, never the selected source ratio.
  for (const viewport of [{width:320,height:568},{width:430,height:932},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await expect.poll(async()=>dialog.locator('.reactEasyCrop_CropArea').evaluate(node=>node.getBoundingClientRect().width/node.getBoundingClientRect().height)).toBeCloseTo(9/19.5,2);
    await expect(confirm).toBeInViewport();
  }
});


test('crop and feed preview keep their proportions and controls across locales', async ({ data, contextFor }, testInfo) => {
  const user = await data.identity('Portrait');
  const page = await (await contextFor(user)).newPage();
  await page.goto('/profile');
  await page.getByPlaceholder('First name', {exact:true}).fill(user.name);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  const buffer = await sharp('public/test-profiles/portrait-1.svg').png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer});
  const dialog = page.getByRole('dialog');
  for (const [locale,previewLabel,mainLabel,roundLabel] of [
    ['en','Preview','Your feed photo','Edit this crop'],
    ['fr','Aperçu','Ta photo dans le feed','Modifier ce cadrage'],
    ['es','Vista previa','Tu foto en el feed','Editar este encuadre'],
  ]) {
    await page.evaluate(locale => {localStorage.setItem('amourette-locale',locale);window.dispatchEvent(new Event('amourette-locale-change'));},locale);
    await page.setViewportSize({width:locale==='fr'?320:390,height:locale==='fr'?568:844});
    const buttons = dialog.locator('header button');
    await expect(buttons.last()).toBeEnabled();
    await expect(buttons.first()).toBeInViewport();
    await expect(buttons.last()).toBeInViewport();
    await expect.poll(()=>dialog.evaluate(node=>node.scrollWidth)).toBe(page.viewportSize()!.width);
    await page.screenshot({path:testInfo.outputPath(`crop-${locale}.png`)});
    await dialog.getByRole('button',{name:roundLabel,exact:true}).click();
    await expect.poll(async()=>dialog.locator('.reactEasyCrop_CropArea').evaluate(node=>node.getBoundingClientRect().width/node.getBoundingClientRect().height)).toBeCloseTo(1,2);
    await page.screenshot({path:testInfo.outputPath(`round-${locale}.png`)});
    await dialog.getByRole('button',{name:mainLabel,exact:true}).click();
    await dialog.getByRole('button',{name:previewLabel,exact:true}).click();
    await expect(dialog.getByTestId('feed-photo-preview')).toBeVisible();
    await expect(dialog.getByRole('slider')).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath(`preview-${locale}.png`)});
    await dialog.getByRole('button',{name:mainLabel,exact:true}).click();
  }
});
