import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
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

test('independent round pixels stay versioned with the portrait through moderation', async ({data,request}) => {
  test.setTimeout(120_000);
  const owner=await data.identity('TwoCrops');
  const peer=await data.identity('RoundPeer','man');
  const founder=await data.identity('RoundReview','woman');
  expect((await data.service.from('admins').insert({user_id:founder.id})).error).toBeNull();
  const clientFor=(token:string)=>createClient(data.env.url,data.env.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const ownerClient=clientFor(owner.session.access_token), peerClient=clientFor(peer.session.access_token), founderClient=clientFor(founder.session.access_token);
  const headers={Authorization:`Bearer ${owner.session.access_token}`};
  const bytes=await sharp({create:{width:1200,height:800,channels:3,background:'#992233'}})
    .composite([{input:await sharp({create:{width:400,height:400,channels:3,background:'#22aa88'}}).png().toBuffer(),left:0,top:0}]).png().toBuffer();
  const crop={x:60,y:0,width:30.75,height:100};
  const roundSourceCrop={x:0,y:0,width:100/3,height:50};
  const permission=await request.post('/api/profile-photo/upload',{headers,data:{type:'image/png',size:bytes.length,revision:0,crop,roundSourceCrop,
    profile:{first_name:owner.name,gender:'woman',interested_in:['man'],adult_confirmed:true}}});
  expect(permission.ok(),await permission.text()).toBeTruthy();
  const ticket=await permission.json();
  expect((await ownerClient.storage.from('profile-photo-staging').uploadToSignedUrl(ticket.path,ticket.token,bytes,{contentType:'image/png'})).error).toBeNull();
  const created=await request.post('/api/profile-photo',{headers,data:{ticket:ticket.ticket}});
  expect(created.ok(),await created.text()).toBeTruthy();
  const first=await created.json();
  const firstVersion=await data.service.from('photo_versions').select('path,round_path,round_source_crop,round_side,source_path').eq('id',first.id).single();
  expect(firstVersion.error).toBeNull();
  expect(firstVersion.data!.round_source_crop).toEqual(roundSourceCrop);
  expect(firstVersion.data!.round_side).toBe(400);
  const downloadRound=(key:string)=>peerClient.storage.from('profile-photo-rounds').download(key,{cacheNonce:randomUUID()},{cache:'no-store'});
  expect((await downloadRound(firstVersion.data!.round_path!)).error).toBeTruthy();
  const venue=await data.venue();await data.checkIn(venue,[owner,peer]);await data.match(venue,owner,peer);
  const read=await downloadRound(firstVersion.data!.round_path!);
  expect(read.error).toBeNull();
  const roundBytes=Buffer.from(await read.data!.arrayBuffer());
  expect(await sharp(roundBytes).raw().toBuffer()).toEqual(await sharp(bytes).extract({left:0,top:0,width:400,height:400}).raw().toBuffer());
  expect((await peerClient.storage.from('profile-photo-sources').download(firstVersion.data!.source_path!)).error).toBeTruthy();
  const originalProjection=await peerClient.rpc('profile_photo_presentation',{p_profile:owner.id});
  expect(originalProjection.error).toBeNull();
  expect(originalProjection.data).toMatchObject({source:firstVersion.data!.path,roundSource:firstVersion.data!.round_path,roundCrop:null});
  const changedRound={x:100/3,y:50,width:100/3,height:50};
  const replace=await request.post('/api/profile-photo',{headers,data:{version:first.id,revision:1,crop,roundSourceCrop:changedRound}});
  expect(replace.ok(),await replace.text()).toBeTruthy();
  const next=await replace.json();
  const pending=await data.service.from('photo_versions').select('path,round_path,source_path').eq('id',next.id).single();
  expect(pending.error).toBeNull();
  expect(pending.data!.source_path).toBe(firstVersion.data!.source_path);
  expect((await downloadRound(pending.data!.round_path!)).error).toBeTruthy();
  expect((await peerClient.rpc('profile_photo_presentation',{p_profile:owner.id})).data).toEqual(originalProjection.data);
  const queue=await founderClient.rpc('admin_photo_framing',{p_profile:owner.id});
  expect(queue.error).toBeNull();
  expect(queue.data[0]).toMatchObject({displayed_round_path:firstVersion.data!.round_path,pending_round_path:pending.data!.round_path});
  expect((await founderClient.rpc('decide_profile_photo',{p_owner:owner.id,p_version:next.id,p_expected_revision:2,p_action:'approved'})).error).toBeNull();
  expect((await peerClient.rpc('profile_photo_presentation',{p_profile:owner.id})).data).toMatchObject({source:pending.data!.path,roundSource:pending.data!.round_path});
  expect((await downloadRound(pending.data!.round_path!)).error).toBeNull();
  expect((await downloadRound(firstVersion.data!.round_path!)).error).toBeTruthy();
  const reopened=await request.get(`/api/profile-photo/source?version=${next.id}&revision=3`,{headers});
  expect(reopened.ok()).toBeTruthy();
  expect(JSON.parse(reopened.headers()['x-photo-round-source-crop'])).toEqual(changedRound);
});
