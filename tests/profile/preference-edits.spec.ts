// Real Supabase integration. Run only after the founder-approved #230 cutover;
// no cooldown reset, role exemption or shared fixture is used.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/database.types';
import { test, expect } from '../helpers/fixtures';

test('owner edits enforce cooldown through RPC and direct writes while keeping bio and matches independent', async ({data,contextFor,request}) => {
  const alice = await data.identity('Alice','woman');
  const bob = await data.identity('Bob','woman');
  const venue = await data.venue();
  await data.checkIn(venue,[alice,bob]);
  const match = await data.match(venue,alice,bob);
  const client = createClient<Database>(data.env.url,data.env.publishableKey,{
    global:{headers:{Authorization:`Bearer ${alice.session.access_token}`}},
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const initial = await client.rpc('get_my_profile_edit_state').single();
  expect(initial.error).toBeNull(); expect(initial.data?.version).toBeNull(); expect(initial.data?.available_at).toBeNull();
  const anonymous = createClient<Database>(data.env.url,data.env.publishableKey,{auth:{persistSession:false}});
  expect((await anonymous.rpc('get_my_profile_edit_state')).error).not.toBeNull();
  const foreign = await request.post(`${data.env.url}/rest/v1/rpc/update_my_profile_preferences`,{
    headers:{apikey:data.env.publishableKey,Authorization:`Bearer ${alice.session.access_token}`},
    data:{p_gender:'man',p_interested_in:['man'],p_expected_version:null,p_owner:bob.id},
  });
  expect(foreign.status()).toBe(404);
  const page = await (await contextFor(alice)).newPage();
  await page.goto('/profile?edit=1');
  await page.getByPlaceholder('Bio (optional)').fill('Unsubmitted bio');
  await page.getByRole('group',{name:'I am',exact:true}).getByRole('button',{name:'Man',exact:true}).click();
  await page.getByRole('button',{name:'Save my preferences',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Save my preferences',exact:true}).click();
  await expect(page.getByText('Preferences saved.',{exact:true})).toBeVisible();
  await expect(page.getByPlaceholder('Bio (optional)')).toHaveValue('Unsubmitted bio');
  const saved = await client.rpc('get_my_profile_edit_state').single();
  expect(saved.error).toBeNull(); expect(saved.data?.gender).toBe('man'); expect(saved.data?.version).toBeTruthy();
  const restricted = await client.rpc('update_my_profile_preferences',{
    p_gender:'woman',p_interested_in:['man'],p_expected_version:saved.data!.version,
  }).single();
  expect(restricted.error).toBeNull(); expect(restricted.data?.status).toBe('cooldown');
  const before = await client.rpc('get_my_profile').single();
  expect((await client.from('profiles').update({gender:'woman',bio:'Must not save'}).eq('id',alice.id)).error).not.toBeNull();
  expect((await client.rpc('get_my_profile').single()).data).toEqual(before.data);
  await page.getByRole('button',{name:'Save my bio',exact:true}).click();
  await expect(page.getByText('Bio saved.',{exact:true})).toBeVisible();
  expect((await client.rpc('get_my_profile').single()).data?.bio).toBe('Unsubmitted bio');
  const reduction = await client.rpc('update_my_profile_preferences',{
    p_gender:'man',p_interested_in:['man'],p_expected_version:saved.data!.version,
  }).single();
  expect(reduction.error).toBeNull(); expect(reduction.data?.status).toBe('saved');
  expect(reduction.data?.available_at).toBe(saved.data?.available_at);
  expect((await client.from('matches').select('id').eq('id',match)).data).toHaveLength(1);
  expect((await client.from('blocks').insert({blocker_id:alice.id,blocked_id:bob.id,reason:'other'})).error).toBeNull();
  expect((await client.from('matches').select('id').eq('id',match)).data).toEqual([]);
});
