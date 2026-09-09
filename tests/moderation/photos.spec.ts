import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { test, expect, type TestIdentity, type TestData } from '../helpers/fixtures';
import type { Database } from '../../lib/database.types';
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
async function upload(request: APIRequestContext, user: TestIdentity, revision: number) {
  const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#805347' } }).jpeg().toBuffer();
  const response = await request.post('/api/profile-photo', { headers: { Authorization: `Bearer ${user.session.access_token}`, ...(process.env.E2E_VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS } : {}) }, multipart: { revision: String(revision), photo: { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer } } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test('private replacements, correction, open chats and stale founder reviews', async ({ data, contextFor, request }) => {
  test.setTimeout(180000);
  const [alice, bob, carol, founder, secondFounder] = [await data.identity('PhotoAlice', 'woman'), await data.identity('PhotoBob', 'man'), await data.identity('PhotoCarol', 'man'), await data.identity('ReviewerOne'), await data.identity('ReviewerTwo')];
  const grants = await data.service.from('admins').insert([{user_id: founder.id}, {user_id: secondFounder.id}]);
  if (grants.error) throw grants.error;
  const venue = await data.venue(); await data.checkIn(venue, [alice,bob,carol]);
  const match = await data.match(venue,alice,bob);
  const aliceClient=client(data,alice), bobClient=client(data,bob), carolClient=client(data,carol);
  const founderClient=client(data,founder), secondClient=client(data,secondFounder);
  const before=await state(data,alice.id);
  const ownContext=await contextFor(alice); const ownPage=await ownContext.newPage();
  await ownPage.goto('/profile?edit=1');
  const chatContext=await contextFor(bob);const chatPage=await chatContext.newPage();
  await chatPage.goto(`/chat/${match}`);await expect(chatPage.getByTestId('chat-input')).toBeVisible();
  const adminContext=await contextFor(founder);const adminPage=await adminContext.newPage();
  await adminPage.goto('/admin');await adminPage.getByRole('button',{name:/Moderation/}).click();
  await expect(adminPage.getByTestId('admin-photo-queue')).toBeVisible();

  await test.step('pending bytes and state are owner/founder only; direct writes fail',async()=>{
    await upload(request,alice,before.revision);
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
    await adminPage.getByTestId('admin-photo-queue').getByRole('button', { name: /PhotoAlice/ }).click();
    await expect(adminPage.getByRole('button', { name: 'Approve new photo', exact: true })).toBeVisible();
    await inspect(adminPage, 'admin-review');
    await adminPage.getByRole('button', { name: 'Enlarge waiting for review' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Enlarged photo' })).toBeAttached();
    await inspect(adminPage, 'admin-zoom');
    await adminPage.getByRole('button', { name: 'Close enlarged photo', exact: true }).click();
    await upload(request, alice, (await state(data, alice.id)).revision);
    await adminPage.getByRole('button', { name: 'Approve new photo', exact: true }).click();
    await expect(adminPage.getByText(/This review changed while you were looking/)).toBeVisible();
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
  await test.step('display rejection removes unmatched likes but preserves chats',async()=>{
    expect((await aliceClient.from('likes').insert({liker_id:alice.id,liked_id:carol.id,venue_id:venue.id})).error).toBeNull();
    const current=await state(data,alice.id);
    expect((await founderClient.rpc('decide_profile_photo',{p_owner:alice.id,p_version:current.displayed_id!,p_expected_revision:current.revision,p_action:'rejected',p_reason:'face_unclear'})).error).toBeNull();
    expect((await aliceClient.from('likes').select('id').eq('liked_id',carol.id)).data).toEqual([]);
    expect((await aliceClient.from('likes').insert({liker_id:alice.id,liked_id:carol.id,venue_id:venue.id})).error).toBeTruthy();
    expect((await carolClient.from('likes').insert({liker_id:carol.id,liked_id:alice.id,venue_id:venue.id})).error).toBeTruthy();
    await expect(ownPage.getByText(/Choose a new photo to appear/)).toBeVisible();
    await expect(chatPage.getByTestId('chat-input')).toBeVisible();
    await expect(chatPage.locator('img[alt="PhotoAlice"]')).toHaveCount(0);
    await inspect(ownPage, 'editor-correction');
    await inspect(chatPage, 'chat-neutral-avatar');
    const profile=await bobClient.from('profiles').select('photo_url').eq('id',alice.id).single();expect(profile.data?.photo_url).toBeNull();
    const sent=await bobClient.from('messages').insert({match_id:match,sender_id:bob.id,body:'Existing chat still works'});expect(sent.error).toBeNull();
  });
  await test.step('a replaced pending version is stale; approval preserves voluntary hiding',async()=>{
    await upload(request,alice,(await state(data,alice.id)).revision);
    const old=await state(data,alice.id);await upload(request,alice,old.revision);
    expect((await founderClient.rpc('decide_profile_photo',{p_owner:alice.id,p_version:old.pending_id!,p_expected_revision:old.revision,p_action:'approved'})).error?.code).toBe('PT409');
    expect((await aliceClient.from('presence').update({is_visible:false}).eq('profile_id',alice.id).is('left_at',null)).error).toBeNull();
    const latest=await state(data,alice.id);
    expect((await secondClient.rpc('decide_profile_photo',{p_owner:alice.id,p_version:latest.pending_id!,p_expected_revision:latest.revision,p_action:'approved'})).error).toBeNull();
    const after=await state(data,alice.id);expect(after.correction_required).toBe(false);
    expect((await aliceClient.from('presence').select('is_visible').eq('profile_id',alice.id).is('left_at',null).single()).data?.is_visible).toBe(false);
    await ownPage.goto('/');await expect(ownPage.getByText('Your photo was approved.')).toBeVisible();
    await inspect(ownPage, 'return-approved');
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
  expect((await moderator.rpc('decide_profile_photo',{p_owner:alice.id,p_version:current.pending_id!,p_expected_revision:current.revision,p_action:'approved'})).error).toBeNull();
  await expect(page.getByText(/Choose a new photo to appear/)).toBeHidden();
});
