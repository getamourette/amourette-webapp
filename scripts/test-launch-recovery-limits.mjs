// #371 (SEC-008): recovery mail cannot be used to mail an address that never paid.
// Real migrations in an isolated PGlite database; no mail is sent.
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,service,admin,fixture,attempt,pay,scalar } from './launch-test-database.mjs';
import { sealCredential } from '../lib/server/launch-secrets.ts';
process.env.LAUNCH_SECRET_KEY=randomBytes(32).toString('hex');
const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
const origin='https://recovery-limits.example.com';
const check=async(name,fn)=>{await fn();console.log('PASS '+name);};
const rpc=async(name,args)=>{const entries=Object.entries(args);return (await service(db,`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;};
async function hold(night,email) {
  const a=attempt(night,email);const c={id:a.id,management:a.management,arrival:a.arrival,issued:Date.now()};
  await rpc('prepare_launch_checkout',{p_id:a.id,p_night:night,p_email:a.email,p_name:a.name,p_locale:a.locale,p_policy:a.policy,p_late_ack:a.late,p_management_secret:a.management,p_arrival_secret:a.arrival,p_envelope:sealCredential(c,'delivery'),p_account:'acct_recovery',p_origin:origin});
  return a;
}
const request=(night,email)=>rpc('request_launch_access',{p_night:night,p_email:email,p_origin:origin});
const mails=email=>scalar(db,"select count(*)::int from private.launch_access_mail where recipient_email=$1 and kind='recovery'",[email]);
// Moves every recovery mail of an address past the two-minute cooldown, keeping it inside the day.
const afterCooldown=email=>db.query("update private.launch_access_mail set created_at=created_at-interval '3 minutes' where recipient_email=$1",[email]);
const expire=a=>db.query("update private.launch_reservations set state='expired',expired_at=clock_timestamp() where id=$1",[a.id]);
const problems=async()=>(await admin(db,'select admin_launch_mail_problems() result'))[0].result;

try {
  await installLaunchSchema(db);
  await check('an unpaid hold queues one recovery mail at most, and a new hold for the address does not reset it',async()=>{
    const email='unpaid-target@example.com';
    const {night}=await fixture(db,{capacity:5});const first=await hold(night,email);
    await request(night,email);assert.equal(await mails(email),1,'the guest who lost the checkout tab still gets one link');
    for(let i=0;i<3;i++) {await afterCooldown(email);await request(night,email);}
    assert.equal(await mails(email),1,'repeated requests on the same unpaid hold send nothing more');
    await expire(first);const second=await hold(night,email);await afterCooldown(email);await request(night,email);
    assert.equal(await mails(email),1,'a second hold for the same address does not get a fresh budget');
    const other=await fixture(db,{capacity:5});await hold(other.night,email);await afterCooldown(email);await request(other.night,email);
    assert.equal(await mails(email),1,'a hold on another night does not get a fresh budget either');
    assert.equal(await scalar(db,"select count(*)::int from private.launch_access_mail where reservation_id=$1",[second.id]),0);
  });
  await check('a paid guest still recovers access after an unpaid-hold link went out',async()=>{
    const email='paid-after-hold@example.com';
    const {night}=await fixture(db);const a=await hold(night,email);await request(night,email);assert.equal(await mails(email),1);
    await pay(db,a);await afterCooldown(email);await request(night,email);
    assert.equal(await mails(email),2);
  });
  await check('one address receives at most ten recovery mails a day across reservations and nights',async()=>{
    const email='paid-twice@example.com';
    const one=await fixture(db),two=await fixture(db);
    await pay(db,await hold(one.night,email));await pay(db,await hold(two.night,email));
    for(let i=0;i<6;i++) {await request(one.night,email);await afterCooldown(email);}
    assert.equal(await mails(email),6);
    for(let i=0;i<6;i++) {await request(two.night,email);await afterCooldown(email);}
    assert.equal(await mails(email),10,'the second reservation does not open ten more');
    await db.query("update private.launch_access_mail set created_at=created_at-interval '1 day' where recipient_email=$1",[email]);
    await request(two.night,email);assert.equal(await mails(email),11,'the budget frees up after 24 hours');
  });
  await check('a global daily ceiling stops recovery mail, raises the founders\' alert and never holds back a confirmation',async()=>{
    // Earlier groups queued mails too; fill the day up to one below the ceiling.
    const ceiling=await scalar(db,'select private.launch_recovery_daily_ceiling()');assert.equal(ceiling,200);
    const filler=await fixture(db);const f=await hold(filler.night,'filler@example.com');
    const queued=await scalar(db,"select count(*)::int from private.launch_access_mail where kind='recovery' and created_at>clock_timestamp()-interval '1 day'");
    await db.query(`insert into private.launch_access_mail(reservation_id,kind,recipient_email,locale,origin,state)
      select $1,'recovery','filler'||g||'@example.com','en',$2,'sent' from generate_series(1,$3::int-1) g`,[f.id,origin,ceiling-queued]);
    let report=await problems();assert.equal(report.recovery_ceiling,200);assert.equal(report.recovery_ceiling_reached,false);
    const {night}=await fixture(db,{capacity:5});
    await pay(db,await hold(night,'last-allowed@example.com'));await request(night,'last-allowed@example.com');
    assert.equal(await mails('last-allowed@example.com'),1);
    report=await problems();assert.equal(report.recovery_ceiling_reached,true);
    assert.equal(JSON.stringify(report).includes('@'),false,'the alert never shows an address');
    const refused=await hold(night,'over-ceiling@example.com');await pay(db,refused);await request(night,'over-ceiling@example.com');
    assert.equal(await mails('over-ceiling@example.com'),0,'no recovery mail past the ceiling');
    assert.equal(await scalar(db,"select count(*)::int from private.launch_access_mail where reservation_id=$1 and kind='confirmed_access'",[refused.id]),1,
      'the confirmation with the QR is still queued');
  });
  await check('a refused request answers exactly like an unknown address',async()=>{
    const {night}=await fixture(db);
    const known=await hold(night,'answer-check@example.com');await pay(db,known);
    await request(night,known.email);await afterCooldown(known.email);
    assert.equal(await mails(known.email),0,'refused by the ceiling');
    assert.deepEqual(await request(night,known.email),await request(night,`${randomUUID()}@example.com`));
  });
  console.log('Recovery mail limits: 5 groups passed.');
} finally {
  await pg.close();
}
