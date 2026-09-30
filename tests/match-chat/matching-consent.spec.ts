import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/database.types';
import { test, expect } from '../helpers/fixtures';
import { likeCommand } from '../helpers/like-command';

// Requires the approved coordinated migration. All identities/venue data are
// isolated fixtures; no permanent QA participant is changed by this journey.
test('withdrawal removes an open candidate, rejects an old action and preserves an established chat',async({data,contextFor})=>{
  test.setTimeout(120_000);
  const venue=await data.venue();
  const alice=await data.identity('Alice','woman');
  const bob=await data.identity('Bob','man');
  const carol=await data.identity('Carol','woman');
  await data.checkIn(venue,[alice,bob,carol]);
  const match=await data.match(venue,alice,bob);
  const client=(identity:typeof alice)=>createClient<Database>(data.env.url,data.env.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${identity.session.access_token}`}},
  });
  const a=client(alice),c=client(carol);
  const staleLike=await likeCommand(c,venue.id,alice.id);
  const aliceContext=await contextFor(alice);
  const editor=await aliceContext.newPage();
  const ownRoom=await aliceContext.newPage();
  const observer=await(await contextFor(carol)).newPage();
  for(const page of [ownRoom,observer]) {
    await page.goto(`/v/${venue.slug}`);
    const primer=page.locator('[aria-labelledby="room-hint-title"]');
    await expect(primer).toBeVisible();await primer.getByRole('button').click();
  }
  await expect(observer.getByRole('heading',{name:'Alice',exact:true})).toBeVisible();
  await editor.goto(`/profile?edit=1&venue=${venue.slug}`);
  await editor.getByRole('button',{name:'Withdraw my agreement',exact:true}).click();
  await editor.getByRole('alertdialog').getByRole('button',{name:'Withdraw my agreement',exact:true}).click();
  await expect(editor.getByText(/Matching is off/)).toBeVisible();
  await expect(observer.getByRole('heading',{name:'Alice',exact:true})).toHaveCount(0);
  await expect(ownRoom.getByText(/Matching is off/)).toBeVisible();
  const refused=await c.rpc('write_like',staleLike).single();
  expect(refused.error).toBeNull();expect(refused.data?.accepted).toBe(false);
  const profile=await a.rpc('get_my_profile').single();
  expect(profile.data).toMatchObject({gender:null,interested_in:null});
  const direct=await a.from('profiles').update({gender:'woman',interested_in:['man']}).eq('id',alice.id);
  expect(direct.error?.code).toBe('42501');
  const consent=await a.rpc('get_my_matching_consent').single();
  expect(consent.data).toMatchObject({active:false});expect(consent.data?.withdrawn_at).toBeTruthy();
  const chat=await aliceContext.newPage();
  await chat.goto(`/chat/${match}`);
  await expect(chat.getByTestId('chat-input')).toBeEnabled();
  await chat.getByTestId('chat-input').fill('Meet by the bar?');await chat.getByTestId('chat-send').click();
  await expect(chat.getByTestId('chat-message').filter({hasText:'Meet by the bar?'})).toHaveAttribute('data-delivery-state','confirmed');
  // A new agreement needs fresh answers and does not resurrect the old gesture.
  await editor.getByRole('group',{name:'I am',exact:true}).getByRole('button',{name:'Woman',exact:true}).click();
  await editor.getByRole('group',{name:'I’d like to meet',exact:true}).getByRole('button',{name:'Woman',exact:true}).click();
  await editor.getByRole('checkbox',{name:/^I agree that Amourette/}).check();
  await editor.getByRole('button',{name:'Agree and enable matching'}).click();
  await expect(editor.getByText('Your agreement is active.',{exact:true})).toBeVisible();
  expect((await c.rpc('write_like',{...staleLike,p_request_id:crypto.randomUUID()}).single()).data?.accepted).toBe(false);
  // Existing night/safety boundaries continue to apply after withdrawal.
  expect((await a.from('blocks').insert({blocker_id:alice.id,blocked_id:bob.id,reason:'other'})).error).toBeNull();
  expect((await a.from('messages').insert({match_id:match,sender_id:alice.id,body:'Unavailable'})).error).not.toBeNull();
});
