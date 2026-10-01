import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/database.types';
import { test, expect } from '../helpers/fixtures';

test('a remote block removes the partner, messages and composer from an open chat',async({data,contextFor})=>{
  const venue=await data.venue();
  const alice=await data.identity('Alice','woman'),bob=await data.identity('Bob','man');
  await data.checkIn(venue,[alice,bob]);
  const match=await data.match(venue,alice,bob);
  const b=createClient<Database>(data.env.url,data.env.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${bob.session.access_token}`}},
  });
  expect((await b.from('messages').insert({match_id:match,sender_id:bob.id,body:'Hello before the block'})).error).toBeNull();
  const page=await(await contextFor(alice)).newPage();
  await page.goto(`/chat/${match}`);
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Bob');
  await expect(page.getByTestId('chat-message')).toContainText('Hello before the block');
  await expect(page.getByTestId('chat-input')).toBeVisible();
  expect((await b.from('blocks').insert({blocker_id:bob.id,blocked_id:alice.id,venue_id:venue.id,reason:'unsafe_behavior'})).error).toBeNull();
  await expect(page.getByText('This conversation is no longer available.',{exact:true})).toBeVisible();
  await expect(page.getByTestId('chat-profile-name')).toHaveCount(0);
  await expect(page.getByTestId('chat-message')).toHaveCount(0);
  await expect(page.getByTestId('chat-input')).toHaveCount(0);
});

// Requires the explicitly founder-approved #195 migration. Never apply it from
// a test. Controlled browser tests and local SQL cover faults without remote writes.
test('remote block converges over private Realtime without waking unrelated room feeds',async({data,contextFor})=>{
  const venue=await data.venue();
  const alice=await data.identity('Alice','woman'),bob=await data.identity('Bob','man'),carl=await data.identity('Carl','man');
  await data.checkIn(venue,[alice,bob,carl]);
  const client=(identity:typeof alice)=>createClient<Database>(data.env.url,data.env.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${identity.session.access_token}`}},
  });
  const a=client(alice),b=client(bob);
  const revision=await a.rpc('my_participant_revision');
  expect(revision.error,'Apply the founder-approved migration before the hosted gate').toBeNull();
  // Explicitly authenticate Broadcast too; the REST bearer alone is not a WS JWT.
  await a.realtime.setAuth(alice.session.access_token);
  const received:unknown[]=[];
  const own=a.channel(`participant:${alice.id}`,{config:{private:true}})
    .on('broadcast',{event:'state_changed'},(event:{payload:unknown})=>received.push(event.payload));
  const foreign=a.channel(`participant:${bob.id}`,{config:{private:true}});
  try {
    await new Promise<void>((resolve,reject)=>own.subscribe(status=>{
      if(status==='SUBSCRIBED')resolve();
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')reject(new Error('Owner channel unavailable'));
    }));
    const denied=await new Promise<string>(resolve=>foreign.subscribe(status=>{
      if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(status))resolve(status);
    }));
    expect(denied).toBe('CHANNEL_ERROR');
    const page=await(await contextFor(alice)).newPage();
    const unrelated=await(await contextFor(carl)).newPage();
    await Promise.all([page.clock.install(),unrelated.clock.install()]);
    await Promise.all([page.goto(`/v/${venue.slug}`),unrelated.goto(`/v/${venue.slug}`)]);
    for(const target of [page,unrelated])await target.locator('[aria-labelledby="room-hint-title"]').getByRole('button').click();
    await expect(page.getByRole('heading',{name:'Bob',exact:true})).toBeVisible();
    await expect(unrelated.getByRole('heading',{name:'Alice',exact:true})).toBeVisible();
    await Promise.all([page.clock.runFor(1500),unrelated.clock.runFor(1500)]);
    let unrelatedReads=0;
    unrelated.on('request',request=>{if(request.url().includes('/rpc/room_candidates'))unrelatedReads++;});
    const original=(await a.rpc('my_participant_revision')).data;
    expect((await b.from('blocks').insert({blocker_id:bob.id,blocked_id:alice.id,venue_id:venue.id,reason:'unsafe_behavior'})).error).toBeNull();
    await expect.poll(()=>received.length).toBeGreaterThan(0);
    await expect(page.getByRole('heading',{name:'Bob',exact:true})).toHaveCount(0);
    await unrelated.clock.runFor(1000);
    expect(unrelatedReads).toBe(0);
    expect((await a.rpc('my_participant_revision')).data).not.toBe(original);
    for(const payload of received){
      expect(payload).toMatchObject({version:1});
      expect(Object.keys(payload as object).sort()).toEqual(['id','version']);
      expect(JSON.stringify(payload)).not.toContain(bob.id);
    }
  } finally { await a.removeAllChannels();await b.removeAllChannels(); }
});

test('remote preference changes add and remove cards; foreground refreshes content',async({data,contextFor})=>{
  const venue=await data.venue();
  const alice=await data.identity('Alice','woman'),bob=await data.identity('Bob','man');
  const client=(identity:typeof alice)=>createClient<Database>(data.env.url,data.env.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${identity.session.access_token}`}},
  });
  const a=client(alice),b=client(bob);
  const initialAlice=await a.rpc('get_my_profile_edit_state').single();
  expect(initialAlice.error).toBeNull();
  const restricted=await a.rpc('update_my_profile_preferences',{p_gender:'woman',p_interested_in:['woman'],p_expected_version:initialAlice.data!.version}).single();
  expect(restricted.error).toBeNull();expect(restricted.data?.status).toBe('saved');
  await data.checkIn(venue,[alice,bob]);
  const page=await(await contextFor(alice)).newPage();
  await page.goto(`/v/${venue.slug}`);
  await expect(page.getByRole('button',{name:'Night options',exact:true})).toBeVisible();
  const card=page.getByRole('heading',{name:'Bob',exact:true});
  await expect(card).toHaveCount(0);
  const initialBob=await b.rpc('get_my_profile_edit_state').single();
  expect(initialBob.error).toBeNull();
  const changed=await b.rpc('update_my_profile_preferences',{p_gender:'woman',p_interested_in:['woman','man'],p_expected_version:initialBob.data!.version}).single();
  expect(changed.error).toBeNull();expect(changed.data?.status).toBe('saved');
  await page.locator('[aria-labelledby="room-hint-title"]').getByRole('button').click();
  await expect(card).toBeVisible();
  await page.screenshot({path:test.info().outputPath('participant-compatible.png'),fullPage:true});
  await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}));
  expect((await b.from('profiles').update({bio:'Updated while away'}).eq('id',bob.id)).error).toBeNull();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.getByText('Updated while away',{exact:true})).toBeVisible();
  const reduced=await b.rpc('update_my_profile_preferences',{p_gender:'woman',p_interested_in:['man'],p_expected_version:changed.data!.version}).single();
  expect(reduced.error).toBeNull();expect(reduced.data?.status).toBe('saved');
  await expect(card).toHaveCount(0);
  await page.screenshot({path:test.info().outputPath('participant-incompatible.png'),fullPage:true});
});
