import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { test, expect } from '../helpers/fixtures';

// UI contract test: source/version metadata are stubbed explicitly. The actual
// owner, Storage and revision boundary is covered by validation/photo-source.
test('editor reopens legacy and pending photos; failed submissions retain the recrop for retry', async ({ data, contextFor }) => {
  const buffer = await sharp({create:{width:1200,height:800,channels:3,background:'#a86475'}}).jpeg().toBuffer();
  const user = await data.identity('EditorCrop','woman',undefined,buffer);
  const page = await (await contextFor(user)).newPage();
  let selectedCrop: object | null = null;
  let selectedRound: object | null = null;
  let pendingId: string | null = null;
  await page.route('**/rest/v1/photo_versions?*',async route => {
    const rows = await data.service.from('photo_versions').select('id,profile_id,path,status,created_at').eq('profile_id',user.id);
    expect(rows.error).toBeNull();
    await route.fulfill({json:rows.data!.map(row=>({...row,round_crop:row.id===pendingId?selectedRound:null}))});
  });
  let sourceRequests = 0;
  await page.route('**/api/profile-photo/source?*',async route => {
    sourceRequests++;
    if (pendingId) expect(new URL(route.request().url()).searchParams.get('version')).toBe(pendingId);
    await route.fulfill({body:buffer,contentType:'image/jpeg',headers:{
      'X-Photo-Crop':JSON.stringify(selectedCrop),'X-Photo-Round-Source-Crop':JSON.stringify(selectedRound),'X-Photo-Legacy':String(!pendingId),
    }});
  });
  await page.goto('/profile?edit=1');
  await expect(page.locator('label img')).toBeVisible();
  await page.getByRole('button',{name:'Recrop',exact:true}).click();
  const dialog = page.getByRole('dialog',{name:'Crop your photo'});
  await expect(dialog.getByText(/This older photo only contains/)).toBeVisible();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('button',{name:'Send this photo',exact:true})).toHaveCount(0);
  // Submit a fixture-only pending version through the unchanged service RPC.
  const pendingPath = `${user.id}/${randomUUID()}.jpg`;
  expect((await data.service.storage.from('profile-photos').upload(pendingPath,buffer,{contentType:'image/jpeg'})).error).toBeNull();
  const state = await data.service.from('photo_state').select('revision').eq('profile_id',user.id).single();
  const pending = await data.service.rpc('submit_profile_photo',{p_owner:user.id,p_path:pendingPath,p_expected_revision:state.data!.revision});
  expect(pending.error).toBeNull();pendingId=pending.data!;
  selectedCrop={x:34.61538461538461,y:0,width:30.769230769230774,height:100};
  selectedRound={x:25,y:20,width:40,height:60};
  await page.reload();
  await expect(page.getByText('Editing the photo awaiting review',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Recrop',exact:true}).click();
  await expect(dialog.getByText('Editing the photo awaiting review',{exact:true})).toBeVisible();
  await dialog.getByRole('slider',{name:'Zoom'}).fill('1.4');
  await dialog.getByRole('button',{name:'Confirm crop',exact:true}).click();
  const preview = await page.locator('label img').getAttribute('src');
  let fail = true;
  const commands: Record<string,unknown>[] = [];
  await page.route('**/api/profile-photo',async route => {
    const body: Record<string,unknown> = route.request().postDataJSON();
    commands.push(body);
    expect(body.version).toBe(pendingId);
    expect(body.revision).toBe(state.data!.revision+1);
    expect(body.crop).toBeTruthy();
    expect(body.roundSourceCrop).toEqual(selectedRound);
    await route.fulfill({status:fail?503:200,json:{}});
  });
  await page.getByRole('button',{name:'Send this photo',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Couldn’t upload'})).toHaveText('Couldn’t upload your photo. Try again.');
  await expect(page.locator('label img')).toHaveAttribute('src',preview!);
  fail=false;
  await page.getByRole('button',{name:'Send this photo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Send this photo',exact:true})).toHaveCount(0);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(sourceRequests).toBe(2);
});
