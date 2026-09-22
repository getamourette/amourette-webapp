import assert from 'node:assert/strict';
import { seedPair, token, command } from './like-test-database.mjs';
import { installProfileEditSchema, state, edit } from './profile-edit-test-database.mjs';

export async function testProfileEditConcurrency(observer, one, two, blocked, waitFor) {
  await installProfileEditSchema(observer);
  for (const same of [true,false]) {
    const f = await seedPair(observer);
    await one.query('begin');
    const first = await edit(one,f.a,'woman',['woman','man']);
    const waiting = edit(two,f.a,'woman',same ? ['man','woman'] : ['woman','nonbinary']);
    await blocked(two); await one.query('commit');
    const last = await waiting;
    assert.equal(last.status,same ? 'unchanged' : 'stale');
    assert.equal(last.version,first.version);
  }
  // Direct writers and RPCs share eligibility-before-profile ordering.
  for (const directFirst of [true,false]) {
    const f = await seedPair(observer);
    const direct = () => one.query("update profiles set interested_in=array['woman','man'] where id=$1",[f.a]);
    const rpc = () => edit(two,f.a,'man',['woman']);
    const holder = directFirst ? one : two, waiter = directFirst ? two : one;
    await holder.query('begin'); await (directFirst ? direct() : rpc());
    const waiting = (directFirst ? rpc() : direct()).then(result => result, error => error);
    await blocked(waiter); await holder.query('commit');
    const result = await waiting;
    if (directFirst) assert.equal(result.status,'stale');
    else assert.match(result.message,/cooldown/);
  }
  // Effective time is read after both the eligibility and the profile row wait.
  for (const barrier of ['eligibility','profile']) {
    const f = await seedPair(observer);
    const initial = await edit(observer,f.a,'woman',['woman','man']);
    await observer.query("update private.profile_edit_state set available_at=clock_timestamp()+interval '250 milliseconds' where profile_id=$1",[f.a]);
    await one.query('begin');
    await one.query(barrier === 'eligibility' ? 'select private.lock_like_eligibility()' : 'select 1 from profiles where id=$1 for update',barrier === 'eligibility' ? [] : [f.a]);
    const waiting = edit(two,f.a,'man',['woman'],initial.version);
    await blocked(two);
    await waitFor(async () => (await observer.query('select clock_timestamp()>=available_at expired from private.profile_edit_state where profile_id=$1',[f.a])).rows[0].expired,'profile cooldown expiry');
    await one.query('commit'); assert.equal((await waiting).status,'saved');
  }
  // Accepted edits, likes, blocks and terminal cleanup serialize in both orders.
  for (const competitor of ['like','block','close']) for (const editFirst of [true,false]) {
    const f = await seedPair(observer);
    const authorization = await token(observer,f.b,f.venue,f.a);
    const update = () => edit(one,f.a,'man',['man']);
    const compete = () => competitor === 'like'
      ? command(two,{actor:f.b,target:f.a,night:f.night,token:authorization})
      : competitor === 'block' ? two.query('insert into blocks values($1,$2)',[f.b,f.a])
        : two.query("select private.transition_venue_night($1,'ended',null,null)",[f.night]);
    const holder = editFirst ? one : two, waiter = editFirst ? two : one;
    await holder.query('begin'); await (editFirst ? update() : compete());
    const waiting = editFirst ? compete() : update();
    await blocked(waiter); await holder.query('commit'); await waiting;
    assert.equal((await observer.query('select count(*)::int n from likes where venue_night_id=$1',[f.night])).rows[0].n,0);
    assert.equal((await state(observer,f.a)).gender,'man');
  }
  console.log('PostgreSQL 17 profile edits: concurrent targets, retries, direct writers, post-lock expiry, likes, blocks and terminal cleanup passed.');
}
