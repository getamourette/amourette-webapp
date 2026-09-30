import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { installLikeSchema, seedPair, token, command } from './like-test-database.mjs';
import { installParticipantSchema } from './participant-test-database.mjs';
import { asUser, installNameSchema } from './name-test-database.mjs';
import { installProfileEditSchema, edit } from './profile-edit-test-database.mjs';

const db = new PGlite();
const adapter = { query: (sql,args) => args ? db.query(sql,args) : db.exec(sql).then(results=>results.at(-1)) };
try {
  await installLikeSchema(adapter); await installNameSchema(adapter); await installProfileEditSchema(adapter);
  await installParticipantSchema(adapter);
  const {a,b,c,venue,night}=await seedPair(adapter);
  const elsewhere=await seedPair(adapter);
  const clear=()=>db.exec('truncate realtime.messages');
  const recipients=async()=> (await db.query('select topic from realtime.messages order by topic')).rows.map(r=>r.topic.replace('participant:',''));
  const expectRecipients=async ids=>assert.deepEqual(await recipients(),[...ids].sort());
  // Expanding an audience does not refetch peers whose compatibility is unchanged.
  const delta=await seedPair(adapter);
  await db.query("update profiles set gender='nonbinary' where id=$1",[delta.c]);
  await clear();
  assert.equal((await edit(db,delta.a,'woman',['woman','nonbinary'])).status,'saved');
  await expectRecipients([delta.a,delta.c]);
  await clear();await db.query('insert into venue_ejections(profile_id,venue_night_id) values($1,$2)',[delta.a,delta.night]);
  await expectRecipients([delta.a,delta.b,delta.c]);
  await clear();await db.query('delete from venue_ejections where profile_id=$1',[delta.a]);
  await expectRecipients([delta.a,delta.b,delta.c]);
  await clear();
  await db.query('update profiles set bio=$1 where id=$2',['Changed',a]);
  await expectRecipients([a,b,c]);
  // One signal for overlapping BEFORE/AFTER audiences, including several writes.
  await clear();
  await db.exec('begin');
  await db.query('update profiles set bio=$1 where id=$2',['First',a]);
  await db.query('update profiles set bio=$1 where id=$2',['Second',a]);
  await db.exec('commit');
  await expectRecipients([a,b,c]);
  const message=(await db.query('select * from realtime.messages limit 1')).rows[0];
  assert.deepEqual(Object.keys(message.payload).sort(),['id','version']);
  assert.equal(message.payload.version,1);assert.equal(message.event,'state_changed');assert.equal(message.private,true);
  await clear();
  await db.query('update profiles set bio=bio,interested_in=interested_in where id=$1',[a]);
  await db.query('update presence set last_seen_at=clock_timestamp() where profile_id=$1',[a]);
  await expectRecipients([]);

  const permission=await token(adapter,a,venue,b);
  await command(adapter,{actor:a,target:b,night,token:permission});
  await command(adapter,{actor:b,target:a,night,token:await token(adapter,b,venue,a)});
  const match=(await db.query('select id from matches where profile_a=$1 and profile_b=$2',[...[a,b].sort()])).rows[0].id;
  await clear();
  let state=await edit(db,a,'woman',['man']);
  assert.equal(state.status,'saved');
  await expectRecipients([a,b,c]); // old audience is notified even though now forbidden
  assert.equal((await db.query('select id from matches where id=$1',[match])).rows.length,1);
  await clear();
  await db.query('update profiles set bio=$1 where id=$2',['Matched bio',a]);
  await expectRecipients([a,b]); // incompatible discovery viewer c is unrelated
  await clear();
  await db.query("update private.profile_edit_state set available_at=clock_timestamp()-interval '1 second' where profile_id=$1",[a]);
  state=await edit(db,a,'woman',['woman'],state.version);
  assert.equal(state.status,'saved');
  await expectRecipients([a,b,c]); // new audience joins too

  await clear();
  const before=(await asUser(db,a,'select my_participant_revision() as revision'))[0].revision;
  await db.exec('begin');await db.query('update profiles set bio=$1 where id=$2',['Rollback',a]);await db.exec('rollback');
  await expectRecipients([]);
  assert.equal((await asUser(db,a,'select my_participant_revision() as revision'))[0].revision,before);
  // Owner-only name workflow; approved public name targets the authorized audience.
  const request=crypto.randomUUID();
  await asUser(db,a,'select submit_name_correction($1,$2)',[request,'New name']);
  await expectRecipients([a]);
  await db.query('insert into admins values($1)',[elsewhere.a]);
  await clear();
  await asUser(db,elsewhere.a,'select * from decide_name_correction($1,$2)',[request,'approved']);
  await expectRecipients([a,b,c]);
  const notice=await asUser(db,b,'select * from chat_partner_state($1)',[match]);
  assert.equal(notice[0].first_name,'New name'); assert.equal(notice[0].correction_id,request);
  assert.equal(notice[0].seen_correction_id,null,'background read cannot consume notice');

  await clear();
  await db.query('insert into blocks(blocker_id,blocked_id) values($1,$2)',[a,b]);
  await expectRecipients([a,b]);
  assert.equal((await db.query('select id from matches where id=$1',[match])).rows.length,0);
  await clear();await db.query('delete from blocks where blocker_id=$1',[a]);await expectRecipients([a,b]);
  await clear();await db.query('update presence set is_visible=false where profile_id=$1',[c]);await expectRecipients([a,b,c]);
  await clear();await db.query('update presence set is_visible=true where profile_id=$1',[c]);await expectRecipients([a,b,c]);
  // Photo removal preserves old audiences; private pending state targets only owner.
  await clear();await db.query("update photo_state set correction_required=true where profile_id=$1",[a]);await expectRecipients([a,b,c]);
  await clear();await db.query("update photo_state set reason='face_unclear' where profile_id=$1",[a]);await expectRecipients([a]);

  await db.exec(`grant insert on realtime.messages to authenticated;
    create policy broad_receive on realtime.messages for select to authenticated using(true);
    create policy broad_send on realtime.messages for insert to authenticated with check(true);`);
  await db.query("select set_config('realtime.topic',$1,false)",[`participant:${a}`]);
  assert.equal((await asUser(db,b,'select * from realtime.messages')).length,0,'cannot join another owner even under a broad policy');
  assert.equal((await asUser(db,a,'select * from realtime.messages')).length,1);
  await assert.rejects(asUser(db,a,"insert into realtime.messages values($1,'broadcast','{}','state_changed',true)",[`participant:${a}`]),/row-level security/);
  await assert.rejects(asUser(db,a,'select * from private.participant_revisions'),/permission denied/);
  await assert.rejects(asUser(db,a,'select private.invalidate_participant($1)',[b]),/permission denied/);
  await assert.rejects(asUser(db,null,'select my_participant_revision()'),/authentication required/);
  await db.exec('set role anon');await assert.rejects(db.query('select my_participant_revision()'),/permission denied/);await db.exec('reset role');
  // Delivery failure does not roll back the safety action; recovery revision survives.
  await db.exec(`create or replace function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language plpgsql as $$begin raise exception 'offline';end$$;`);
  await db.query('insert into blocks(blocker_id,blocked_id) values($1,$2)',[a,c]);
  assert.notEqual((await asUser(db,a,'select my_participant_revision() as revision'))[0].revision,before);
  console.log('participant SQL: targeted audiences, atomic revisions, no-op/rollback, private transport and recovery passed');
} finally { await db.close(); }
