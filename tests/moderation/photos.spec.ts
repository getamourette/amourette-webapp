import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { test, expect, type TestIdentity, type TestData } from '../helpers/fixtures';
import type { Database, Json } from '../../lib/database.types';
import type { APIRequestContext, Page } from '@playwright/test';
async function inspect(page: Page, state: string) {
  const directory = process.env.E2E_SCREENSHOTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${test.info().project.name}-${state}.png`), fullPage: true });
}
function client(data: TestData, user: TestIdentity) {
  return createClient<Database>(data.env.url, data.env.publishableKey, { global: { headers: { Authorization: `Bearer ${user.session.access_token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
}
async function state(data: TestData, id: string) {
  const result = await data.service.from('photo_state').select('profile_id, displayed_id, pending_id, correction_required, reason, last_action, revision, updated_at').eq('profile_id', id).single();
  if (result.error) throw result.error;
  return result.data;
}
async function upload(request: APIRequestContext, user: TestIdentity, revision: number, profile?: Json) {
  const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#805347' } }).jpeg().toBuffer();
  const response = await request.post('/api/profile-photo', { headers: { Authorization: `Bearer ${user.session.access_token}`, ...(process.env.E2E_VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS } : {}) }, multipart: { revision: String(revision), ...(profile ? { profile: JSON.stringify(profile) } : {}), photo: { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer } } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test('private replacements, correction, open chats and stale founder reviews', async ({ data, contextFor, request }) => {
  test.setTimeout(180000);
  const [alice, bob, carol, founder, secondFounder] = [await data.identity('PhotoAlice'), await data.identity('PhotoBob', 'man'), await data.identity('PhotoCarol', 'man'), await data.identity('ReviewerOne'), await data.identity('ReviewerTwo')];
  await upload(request, alice, 0, { first_name: alice.name, gender: 'woman', interested_in: ['man'], adult_confirmed: true });
  const grants = await data.service.from('admins').insert([{user_id: founder.id}, {user_id: secondFounder.id}]);
  if (grants.error) throw grants.error;
  const venue = await data.venue(); await data.checkIn(venue, [alice,bob,carol]);
  const match = await data.match(venue,alice,bob);
  const aliceClient=client(data,alice), bobClient=client(data,bob), carolClient=client(data,carol);
  const founderClient=client(data,founder), secondClient=client(data,secondFounder);
  const before=await state(data,alice.id);
  const ownContext=await contextFor(alice); const ownPage=await ownContext.newPage();
  await ownPage.goto('/profile?edit=1');
  // A second browser also verifies independent device acknowledgements.
  const roomContext = await contextFor(alice);
  const roomPage = await roomContext.newPage();
  await roomPage.addLocatorHandler(roomPage.getByRole('button', { name: 'See who else is here', exact: true }), async button => { await button.click(); });
  await roomPage.addLocatorHandler(roomPage.getByRole('button', { name: 'Close email signup', exact: true }), async button => { await button.click(); });
  await roomPage.goto(`/v/${venue.slug}`);
  await roomPage.locator('[aria-labelledby="room-hint-title"]').getByRole('button').click();
  await roomPage.getByRole('button', { name: 'Room options', exact: true }).click();
  await expect(roomPage.getByTestId('room-menu-profile-name')).toHaveText('PhotoCarol');
  await roomPage.getByRole('button', { name: 'Room options', exact: true }).click();
  const chatContext=await contextFor(bob);const chatPage=await chatContext.newPage();
  await chatPage.goto(`/chat/${match}`);await expect(chatPage.getByTestId('chat-input')).toBeVisible();
  await expect(chatPage.getByTestId('chat-profile-open').locator('img')).toBeVisible();
  const adminContext=await contextFor(founder);const adminPage=await adminContext.newPage();
  await adminPage.goto('/admin');await adminPage.getByRole('button',{name:/Moderation/}).click();
  await expect(adminPage.getByTestId('admin-photo-queue')).toBeVisible();

  await test.step('pending bytes and state are owner/founder only; direct writes fail',async()=>{
    await upload(request,alice,before.revision);
    const displayed = await data.service.from('photo_versions').select('path, status').eq('id', before.displayed_id!).single();
    expect(displayed.data?.status).toBe('unverified');
    expect((await bobClient.storage.from('profile-photos').download(displayed.data!.path)).error).toBeNull();
    const pending=await state(data,alice.id);expect(pending.displayed_id).toBe(before.displayed_id);
    const version=await data.service.from('photo_versions').select('path').eq('id',pending.pending_id!).single();
    expect(version.error).toBeNull();const path=version.data!.path;
    expect((await bobClient.from('photo_versions').select('id').eq('id',pending.pending_id!)).data).toEqual([]);
    expect((await bobClient.from('photo_state').select('profile_id').eq('profile_id',alice.id)).data).toEqual([]);
    expect((await bobClient.storage.from('profile-photos').download(path)).error).toBeTruthy();
    expect((await aliceClient.storage.from('profile-photos').download(path)).error).toBeNull();
    expect((await aliceClient.storage.from('profile-photos').update(path,new Uint8Array([1]),{contentType:'image/jpeg'})).error).toBeTruthy();
    expect((await aliceClient.from('profiles').update({photo_url:'forged'}).eq('id',alice.id)).error).toBeTruthy();
    const auditWrite = await request.patch(`${data.env.url}/rest/v1/photo_audit?profile_id=eq.${alice.id}`, { headers: { apikey: data.env.publishableKey, Authorization: `Bearer ${alice.session.access_token}` }, data: { action: 'approved' } });
    expect(auditWrite.ok()).toBe(false);
    expect((await aliceClient.rpc('decide_profile_photo',{p_owner:alice.id,p_version:pending.pending_id!,p_expected_revision:pending.revision,p_action:'approved'})).error).toBeTruthy();
    await expect(ownPage.getByText('Waiting for review',{exact:true})).toBeVisible();
    await expect(ownPage.getByTestId('photo-status').locator('img')).toHaveCount(2);
    await inspect(ownPage, 'editor-pending');
    const beforeFailure = await state(data, alice.id);
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#543121' } }).jpeg().toBuffer();
    await ownPage.locator('input[type=file]').setInputFiles({ name: 'retry.jpg', mimeType: 'image/jpeg', buffer: image });
    await ownPage.route('**/api/profile-photo', route => route.fulfill({ status: 503, body: '{}' }));
    await ownPage.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(ownPage.getByText('Photo upload failed.', { exact: true })).toBeVisible();
    expect((await state(data, alice.id)).revision).toBe(beforeFailure.revision);
    await ownPage.unroute('**/api/profile-photo');
  });
  await test.step('a submission replaced during visual review warns and reloads', async () => {
    await adminPage.reload();
    await adminPage.getByRole('button', { name: /Moderation/ }).click();
    await adminPage.getByTestId('admin-photo-queue').getByRole('combobox').selectOption(venue.nightId);
    await expect(adminPage.getByTestId('photo-pending-count')).toHaveText('3 pending');
    const emptyVenue = await data.venue();
    // Reload the night options after creating this isolated empty night.
    await adminPage.reload();
    await adminPage.getByRole('button', { name: /Moderation/ }).click();
    await adminPage.getByTestId('admin-photo-queue').getByRole('combobox').selectOption(emptyVenue.nightId);
    await expect(adminPage.getByTestId('photo-pending-count')).toHaveText('0 pending');
    await adminPage.getByTestId('admin-photo-queue').getByRole('combobox').selectOption(venue.nightId);
    await expect(adminPage.getByTestId('photo-pending-count')).toHaveText('3 pending');
    await adminPage.getByRole('button', { name: /^Photos / }).click();
    await expect(adminPage.getByTestId('admin-photo-queue').getByRole('button', { name: /PhotoAlice/ })).toBeHidden();
    await adminPage.getByRole('button', { name: /^Photos / }).click();
    await Promise.all([
      adminPage.waitForResponse(response => response.url().includes('/rpc/admin_photo_queue')),
      adminPage.getByRole('button', { name: 'Refresh', exact: true }).click(),
    ]);
    await expect(adminPage.getByText('Moderation refreshed. Photos update automatically.')).toBeVisible();
    const ownerReview = adminPage.getByTestId('admin-photo-queue').getByRole('button', { name: /PhotoAlice/ });
    await expect(ownerReview).toHaveCount(1);
    await ownerReview.click();
    await expect(adminPage.getByRole('button', { name: 'Approve new photo', exact: true })).toBeVisible();
    await expect(adminPage.locator('img[alt="Waiting for review"]')).toBeVisible();
    await expect(adminPage.locator('img[alt="Visible to others"]')).toBeVisible();
    await expect(adminPage.getByTestId('photo-detail-night')).toContainText(`E2E ${data.runId.slice(0, 8)}`);
    await test.step('background recovery keeps inspected photos visible while checking access', async () => {
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      let waiting = 0;
      await adminPage.route('**/storage/v1/object/**', async route => { waiting++; await held; await route.continue(); });
      try {
        await adminPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect.poll(() => waiting).toBeGreaterThan(0);
        await expect(adminPage.locator('img[alt="Waiting for review"]')).toBeVisible();
        await expect(adminPage.locator('img[alt="Visible to others"]')).toBeVisible();
      } finally {
        release();
        await adminPage.unrouteAll({ behavior: 'wait' });
      }
    });
    await inspect(adminPage, 'admin-review');
    await adminPage.getByRole('button', { name: 'Enlarge waiting for review' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Enlarged photo' })).toBeAttached();
    await expect(adminPage.locator('img[alt="Profile under review"]')).toBeVisible();
    await inspect(adminPage, 'admin-zoom');
    await adminPage.getByRole('button', { name: 'Close enlarged photo', exact: true }).click();
    await upload(request, alice, (await state(data, alice.id)).revision);
    await adminPage.getByRole('button', { name: 'Approve new photo', exact: true }).click();
    await expect(adminPage.getByText(/This review changed while you were looking/)).toBeVisible();
    await expect(adminPage.locator('img[alt="Waiting for review"]')).toBeVisible();
    await inspect(adminPage, 'admin-stale');
    expect((await state(data, alice.id)).pending_id).not.toBeNull();
    await adminPage.getByRole('button', { name: 'Close photo review', exact: true }).click();
  });
  await test.step('two founders cannot both decide a reviewed revision',async()=>{
    const pending=await state(data,alice.id);
    const args={p_owner:alice.id,p_version:pending.pending_id!,p_expected_revision:pending.revision,p_action:'rejected',p_reason:'multiple_people'};
    const results=await Promise.all([founderClient.rpc('decide_profile_photo',args),secondClient.rpc('decide_profile_photo',args)]);
    expect(results.filter(r=>!r.error)).toHaveLength(1);
    expect(results.find(r=>r.error)?.error?.code).toBe('PT409');
    expect((await state(data,alice.id)).displayed_id).toBe(before.displayed_id);
    await expect(ownPage.getByText('Your new photo was not approved. Your previous photo is still visible.')).toBeVisible();
  });
  await test.step('a report opens the same photo review and stays open after approval', async () => {
    const report = await carolClient.rpc('submit_report', { p_reported_id: alice.id, p_venue_night_id: venue.nightId, p_reason: 'fake_profile' });
    expect(report.error).toBeNull();
    await adminPage.getByRole('button', { name: 'Refresh', exact: true }).click();
    const reportRow = adminPage.locator('tr[role=button]').filter({ hasText: `E2E ${data.runId.slice(0, 8)}` });
    await expect(reportRow).toHaveCount(1);
    await reportRow.click();
    await adminPage.getByRole('button', { name: 'Review photos', exact: true }).click();
    await expect(adminPage.getByRole('heading', { name: 'PhotoAlice · Photo review', exact: true })).toBeVisible();
    await adminPage.getByRole('button', { name: 'Approve displayed photo', exact: true }).click();
    await expect(adminPage.getByText('Photo decision saved. Any report remains open until handled separately.')).toBeVisible();
    const unchangedReport = await founderClient.from('reports').select('reviewed_at').eq('id', report.data!).single();
    expect(unchangedReport.error).toBeNull(); expect(unchangedReport.data?.reviewed_at).toBeNull();
    await inspect(adminPage, 'report-photo-review');
    await expect(roomPage.getByText('Your photo was approved.')).toBeVisible();
    await inspect(roomPage, 'room-approved');
    await roomPage.getByRole('button', { name: 'OK', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Close photo review', exact: true }).click();
  });
  await test.step('display rejection removes unmatched likes but preserves chats',async()=>{
    expect((await aliceClient.from('likes').insert({liker_id:alice.id,liked_id:carol.id,venue_id:venue.id})).error).toBeNull();
    const current=await state(data,alice.id);
    expect((await founderClient.rpc('decide_profile_photo',{p_owner:alice.id,p_version:current.displayed_id!,p_expected_revision:current.revision,p_action:'rejected',p_reason:'face_unclear'})).error).toBeNull();
    expect((await aliceClient.from('likes').select('id').eq('liked_id',carol.id)).data).toEqual([]);
    expect((await aliceClient.from('likes').insert({liker_id:alice.id,liked_id:carol.id,venue_id:venue.id})).error).toBeTruthy();
    expect((await carolClient.from('likes').insert({liker_id:carol.id,liked_id:alice.id,venue_id:venue.id})).error).toBeTruthy();
    await expect(ownPage.getByText(/Choose a new photo to appear/)).toBeVisible();
    await expect(roomPage.getByText(/Choose a new photo to appear/)).toBeVisible();
    await roomPage.getByRole('button', { name: 'Room options', exact: true }).click();
    await expect(roomPage.getByTestId('room-menu-profile-name')).toBeHidden();
    await expect(roomPage.getByRole('button', { name: 'Report', exact: true })).toBeHidden();
    await expect(roomPage.getByRole('button', { name: 'Block', exact: true })).toBeHidden();
    await roomPage.getByRole('button', { name: 'Room options', exact: true }).click();
    await expect(chatPage.getByTestId('chat-input')).toBeVisible();
    await expect(chatPage.getByTestId('chat-profile-open').locator('img')).toHaveCount(0);
    await inspect(ownPage, 'editor-correction');
    await inspect(chatPage, 'chat-neutral-avatar');
    const rejected = await data.service.from('photo_versions').select('path').eq('id', before.displayed_id!).single();
    // Previously authorized CDN responses cannot prove current RLS access.
    const fresh = await bobClient.storage.from('profile-photos').download(rejected.data!.path, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' });
    expect(fresh.error).toBeTruthy();
    await chatPage.reload();
    await expect(chatPage.getByTestId('chat-input')).toBeEnabled();
    const profile=await bobClient.from('profiles').select('photo_url').eq('id',alice.id).single();expect(profile.data?.photo_url).toBeNull();
    const sent=await bobClient.from('messages').insert({match_id:match,sender_id:bob.id,body:'Existing chat still works'});expect(sent.error).toBeNull();
  });
  await test.step('a replaced pending version is stale; approval preserves voluntary hiding',async()=>{
    await upload(request,alice,(await state(data,alice.id)).revision);
    await expect(ownPage.getByText('Your new photo is waiting for review.')).toBeVisible();
    await expect(ownPage.getByText(/Choose a new photo to appear/)).toBeHidden();
    await expect(ownPage.getByText(/Your face must be easy/)).toBeHidden();
    await expect(roomPage.getByText('Your new photo is waiting for review.')).toBeVisible();
    await inspect(roomPage, 'room-pending');
    await expect(roomPage.getByRole('link', { name: 'Update my photo', exact: true })).toBeHidden();
    await roomPage.close();
    const old=await state(data,alice.id);await upload(request,alice,old.revision);
    expect((await founderClient.rpc('decide_profile_photo',{p_owner:alice.id,p_version:old.pending_id!,p_expected_revision:old.revision,p_action:'approved'})).error?.code).toBe('PT409');
    expect((await aliceClient.from('presence').update({is_visible:false}).eq('profile_id',alice.id).is('left_at',null)).error).toBeNull();
    const latest=await state(data,alice.id);
    expect((await secondClient.rpc('decide_profile_photo',{p_owner:alice.id,p_version:latest.pending_id!,p_expected_revision:latest.revision,p_action:'approved'})).error).toBeNull();
    const after=await state(data,alice.id);expect(after.correction_required).toBe(false);
    expect((await aliceClient.from('presence').select('is_visible').eq('profile_id',alice.id).is('left_at',null).single()).data?.is_visible).toBe(false);
    await expect(ownPage.getByText('Your photo was approved.')).toBeVisible();
    await inspect(ownPage, 'editor-approved');
    await ownPage.goto('/');await expect(ownPage.getByText('Your photo was approved.')).toBeHidden();
    await expect(ownPage.locator('img[alt="PhotoAlice"]')).toBeVisible();
    await inspect(ownPage, 'return-approved');
    await ownPage.goto('/profile?edit=1');
    await expect(ownPage.getByRole('heading', { name: 'Edit your profile' })).toBeVisible();
    await expect(ownPage.getByText('Your photo was approved.')).toBeHidden();
    await expect(ownPage.locator('label img')).toBeVisible();
    await expect(ownPage.getByTestId('photo-status')).toBeHidden();
    await inspect(ownPage, 'editor-return-normal');
  });
  await test.step('a like racing rejection cannot survive as an unmatched like', async () => {
    const current = await state(data, bob.id);
    const [decision] = await Promise.all([
      founderClient.rpc('decide_profile_photo', { p_owner: bob.id, p_version: current.displayed_id!, p_expected_revision: current.revision, p_action: 'rejected', p_reason: 'face_unclear' }),
      carolClient.from('likes').insert({ liker_id: carol.id, liked_id: bob.id, venue_id: venue.id }),
    ]);
    expect(decision.error).toBeNull();
    expect((await carolClient.from('likes').select('id').eq('liked_id', bob.id)).data).toEqual([]);
    expect((await state(data, bob.id)).correction_required).toBe(true);
  });
});

test('cancelled correction persists outside a night and after the next scan',async({data,contextFor,request})=>{
  test.setTimeout(120000);
  const alice=await data.identity('ReturningPhoto','woman');const founder=await data.identity('PhotoReviewer');
  const grant=await data.service.from('admins').insert({user_id:founder.id});if(grant.error)throw grant.error;
  const moderator=client(data,founder),owner=client(data,alice);let current=await state(data,alice.id);
  expect((await moderator.rpc('decide_profile_photo',{p_owner:alice.id,p_version:current.displayed_id!,p_expected_revision:current.revision,p_action:'rejected',p_reason:'not_person'})).error).toBeNull();
  await upload(request,alice,(await state(data,alice.id)).revision);current=await state(data,alice.id);
  expect((await owner.rpc('decide_profile_photo',{p_owner:alice.id,p_version:current.pending_id!,p_expected_revision:current.revision,p_action:'cancelled'})).error).toBeNull();
  const context=await contextFor(alice);const page=await context.newPage();await page.goto('/');
  await expect(page.getByText(/Choose a new photo to appear/)).toBeVisible();
  const venue=await data.venue();await page.goto(`/v/${venue.slug}`);
  await expect(page.getByTestId('photo-status')).toBeVisible();
  expect((await state(data,alice.id)).correction_required).toBe(true);
  await inspect(page, 'room-correction');
  await upload(request,alice,(await state(data,alice.id)).revision);current=await state(data,alice.id);
  await page.goto('about:blank');
  expect((await moderator.rpc('decide_profile_photo',{p_owner:alice.id,p_version:current.pending_id!,p_expected_revision:current.revision,p_action:'approved'})).error).toBeNull();
  await page.goto('/');
  await expect(page.getByText('Your photo was approved.')).toBeVisible();
  await inspect(page, 'approval-after-absence');
  await expect(page.getByText(/Choose a new photo to appear/)).toBeHidden();
  await page.goto('/profile?edit=1');
  await expect(page.getByRole('heading', { name: 'Edit your profile' })).toBeVisible();
  await expect(page.getByText('Your photo was approved.')).toBeHidden();
  await expect(page.locator('label img')).toBeVisible();
  await test.step('photo approval cannot undo an independent venue ejection', async () => {
    current = await state(data, alice.id);
    expect((await moderator.rpc('decide_profile_photo', { p_owner: alice.id, p_version: current.displayed_id!, p_expected_revision: current.revision, p_action: 'rejected', p_reason: 'face_unclear' })).error).toBeNull();
    await upload(request, alice, (await state(data, alice.id)).revision);
    expect((await moderator.rpc('eject_from_venue', { p_profile_id: alice.id, p_venue_id: venue.id, p_reason: 'unsafe_behavior' })).error).toBeNull();
    current = await state(data, alice.id);
    expect((await moderator.rpc('decide_profile_photo', { p_owner: alice.id, p_version: current.pending_id!, p_expected_revision: current.revision, p_action: 'approved' })).error).toBeNull();
    expect((await state(data, alice.id)).correction_required).toBe(false);
    expect((await owner.rpc('check_in', { p_venue_id: venue.id })).error).toBeTruthy();
    const presence = await owner.from('presence').select('id').eq('profile_id', alice.id).is('left_at', null);
    expect(presence.error).toBeNull(); expect(presence.data).toEqual([]);
  });
});
