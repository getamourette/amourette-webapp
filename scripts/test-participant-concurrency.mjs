import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { installParticipantSchema } from './participant-test-database.mjs';
import { seedPair,token,command } from './like-test-database.mjs';
import { asUser } from './name-test-database.mjs';

export async function testParticipantConcurrency(observer,one,two,blocked) {
  await installParticipantSchema(observer);
  for(const first of ['bio','preferences','name','block']) for(const reverse of [false,true]) {
    const f=await seedPair(observer);
    const request=crypto.randomUUID();
    const mutations={
      bio:()=>one.query("update profiles set bio='Updated' where id=$1",[f.a]),
      preferences:()=>one.query("update profiles set interested_in=array['man'] where id=$1",[f.a]),
      name:()=>asUser(one,f.a,'select submit_name_correction($1,$2)',[request,'Alice']),
      block:()=>one.query('insert into blocks(blocker_id,blocked_id) values($1,$2)',[f.a,f.b]),
    };
    const peer=()=>two.query("update profiles set bio='Peer update' where id=$1",[f.b]);
    const holder=reverse?two:one,waiter=reverse?one:two;
    await holder.query('begin');await (reverse?peer():mutations[first]());
    const pending=reverse?mutations[first]():peer();
    await blocked(waiter);await holder.query('commit');await pending;
    assert.ok((await asUser(observer,f.a,'select my_participant_revision() revision'))[0].revision);
  }
  // A candidate read blocked by a changing audience sees the committed state.
  {
    const f=await seedPair(observer);
    const stale=await token(observer,f.a,f.venue,f.b);
    await one.query('begin');await one.query("update profiles set interested_in=array['man'] where id=$1",[f.b]);
    const read=token(two,f.a,f.venue,f.b);await blocked(two);await one.query('commit');assert.equal(await read,undefined);
    assert.equal((await command(observer,{actor:f.a,target:f.b,night:f.night,token:stale})).accepted,false);
  }
  // Bounded synthetic workloads measure recipients and mutation time. These are
  // local PostgreSQL observations, not Supabase/network capacity claims.
  for(const size of [30,100]) {
    const f=await seedPair(observer);
    for(let i=3;i<size;i++) {
      const id=crypto.randomUUID();
      await observer.query('insert into auth.users values($1)',[id]);
      await observer.query("insert into profiles(id,first_name,photo_url,gender,interested_in) values($1,'Load test',$2,'woman',array['woman'])",[id,`${id}/test.jpg`]);
      await observer.query('insert into presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)',[id,f.venue,f.night]);
    }
    await observer.query('truncate realtime.messages');
    let start=performance.now();await observer.query('insert into blocks(blocker_id,blocked_id) values($1,$2)',[f.a,f.b]);
    const blockMs=performance.now()-start;
    assert.equal((await observer.query('select count(*)::int n from realtime.messages')).rows[0].n,2);
    await observer.query('truncate realtime.messages');
    start=performance.now();await observer.query("update profiles set bio='New content' where id=$1",[f.c]);
    const contentMs=performance.now()-start;
    assert.equal((await observer.query('select count(*)::int n from realtime.messages')).rows[0].n,size);
    console.log(`Participant invalidation, ${size} co-present profiles: block ${blockMs.toFixed(2)} ms / 2 recipients; bio ${contentMs.toFixed(2)} ms / ${size} recipients.`);
  }
  console.log('Participant concurrency: content, preferences, names, blocks, candidate reads and recipient counts passed.');
}
