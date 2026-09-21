import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { test, expect } from '../helpers/fixtures';

test('source is owner-only even after matching; recrops reuse it and await moderation', async ({ data, request }) => {
  const owner = await data.identity('RecropOwner');
  const other = await data.identity('RecropOther', 'man');
  const headers = { Authorization: `Bearer ${owner.session.access_token}` };
  const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#6d274b' } })
    .withExifMerge({ IFD0: { Artist: 'private-source-marker' } }).jpeg().toBuffer();
  const response = await request.post('/api/profile-photo', { headers, multipart: {
    revision: '0', photo: { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: bytes },
    profile: JSON.stringify({first_name:owner.name,gender:'woman',interested_in:['man'],adult_confirmed:true}),
  }});
  expect(response.ok(),await response.text()).toBeTruthy();
  const original: {id:string} = await response.json();
  const readVersion = (id:string) => data.service.from('photo_versions').select('path,source_path,portrait_crop,round_crop,status').eq('id',id).single();
  const originalVersion = await readVersion(original.id);
  expect(originalVersion.error).toBeNull();
  expect(originalVersion.data!.source_path).toBeTruthy();
  const sourcePath = `/api/profile-photo/source?version=${original.id}&revision=1`;
  expect((await request.get(sourcePath)).status()).toBe(401);
  const source = await request.get(sourcePath,{headers});
  expect(source.ok(),await source.text()).toBeTruthy();
  expect(source.headers()['cache-control']).toContain('no-store');
  const originalBytes = await source.body();
  expect(originalBytes.includes(Buffer.from('private-source-marker'))).toBe(false);
  expect(await sharp(originalBytes).raw().toBuffer()).toEqual(await sharp(bytes).raw().toBuffer());
  const foreign = {Authorization:`Bearer ${other.session.access_token}`};
  expect((await request.get(sourcePath,{headers:foreign})).status()).toBe(404);
  const venue = await data.venue();
  await data.checkIn(venue,[owner,other]);
  await data.match(venue,owner,other);
  expect((await request.get(sourcePath,{headers:foreign})).status()).toBe(404);
  for (const token of [owner.session.access_token,other.session.access_token]) {
    const client = createClient(data.env.url,data.env.publishableKey,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${token}`}}});
    expect((await client.storage.from('profile-photo-sources').download(originalVersion.data!.source_path!)).error).toBeTruthy();
  }
  const crop = {x:30,y:0,width:30.75,height:100}; // 369 × 800 native pixels.
  const roundCrop = {x:0,y:10,width:100,height:46.125};
  const state = () => data.service.from('photo_state').select('revision,displayed_id,pending_id').eq('profile_id',owner.id).single();
  const before = (await state()).data;
  for (const body of [
    {version:original.id,revision:1,crop:{...crop,x:-1}},
    {version:original.id,revision:1,crop,roundCrop:{...roundCrop,height:100}},
    {version:original.id,revision:1,crop,unexpected:true},
  ]) expect((await request.post('/api/profile-photo',{headers,data:body})).status()).toBe(400);
  expect((await state()).data).toEqual(before);
  const stale = await request.post('/api/profile-photo',{headers,data:{version:original.id,revision:0,crop}});
  expect(stale.status()).toBe(409);
  const recrop = await request.post('/api/profile-photo',{headers,data:{version:original.id,revision:1,crop,roundCrop}});
  expect(recrop.ok(),await recrop.text()).toBeTruthy();
  const replacement: {id:string} = await recrop.json();
  const version = await readVersion(replacement.id);
  expect(version.data!.source_path).toBe(originalVersion.data!.source_path);
  expect(version.data!.portrait_crop).toEqual(crop);
  expect(version.data!.round_crop).toEqual(roundCrop);
  expect((await state()).data).toEqual({revision:2,displayed_id:original.id,pending_id:replacement.id});
  const reopen = await request.get(`/api/profile-photo/source?version=${replacement.id}&revision=2`,{headers});
  expect(reopen.ok()).toBeTruthy();
  expect(JSON.parse(reopen.headers()['x-photo-crop'])).toEqual(crop);
  expect(JSON.parse(reopen.headers()['x-photo-round-crop'])).toEqual(roundCrop);
  expect((await sharp(await reopen.body()).metadata()).width).toBe(1200);
  const stored = await data.service.storage.from('profile-photos').download(version.data!.path);
  const dimensions = await sharp(Buffer.from(await stored.data!.arrayBuffer())).metadata();
  expect([dimensions.width,dimensions.height]).toEqual([369,800]);
});
