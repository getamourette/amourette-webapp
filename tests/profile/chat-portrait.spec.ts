import sharp from 'sharp';
import { test, expect } from '../helpers/fixtures';

test('chat uses a round crop in its header and shows the complete portrait in the profile sheet', async ({ data, contextFor }, testInfo) => {
  const alice = await data.identity('Alice','woman');
  const portrait = await sharp({create:{width:390,height:845,channels:3,background:'#8d354d'}})
    .composite([{input:await sharp({create:{width:390,height:80,channels:3,background:'#d4af70'}}).png().toBuffer(),left:0,top:0}]).jpeg().toBuffer();
  const bob = await data.identity('Bob','man',undefined,portrait);
  const venue = await data.venue();
  await data.checkIn(venue,[alice,bob]);
  const match = await data.match(venue,alice,bob);
  const profile = await data.service.from('profiles').select('photo_url').eq('id',bob.id).single();
  const page = await (await contextFor(alice)).newPage();
  // The UI tests the upcoming projection contract; API/SQL suites test access.
  await page.route('**/rpc/profile_photo_presentation',async route => {
    expect(route.request().postDataJSON().p_profile).toBe(bob.id);
    await route.fulfill({json:{source:profile.data!.photo_url,roundCrop:{x:0,y:10,width:100,height:390/845*100}}});
  });
  await page.goto(`/chat/${match}`);
  const trigger = page.getByTestId('chat-profile-open');
  await expect(trigger.locator('img')).toBeVisible();
  await expect(trigger.locator('img')).toHaveCSS('position','absolute');
  for (const viewport of [{width:320,height:568},{width:430,height:932}]) {
    await page.setViewportSize(viewport);
    await trigger.click();
    const dialog = page.getByTestId('chat-profile-dialog');
    const image = dialog.locator('img');
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS('object-fit','contain');
    await expect(image).toHaveJSProperty('naturalWidth',390);
    await expect(image).toHaveJSProperty('naturalHeight',845);
    await expect(dialog.getByRole('heading',{name:'Bob'})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`chat-portrait-${viewport.width}.png`)});
    await dialog.getByRole('button',{name:'Back to the conversation',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByTestId('chat-input')).toBeVisible();
  }
});
