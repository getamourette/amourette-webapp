// #476 existing-data check: reservations made under the seven-day rule keep working
// once the migration runs, and nothing they hold is shortened or unbound.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,accessUntilNightEndMigration,service,fixture,attempt,get,pay,scalar } from './launch-test-database.mjs';
import { openCredential,sealCredential,sealAccessProof,openAccessProof } from '../lib/server/launch-secrets.ts';
import { exchangeAccess } from '../lib/server/launch-access.ts';
process.env.LAUNCH_SECRET_KEY=randomBytes(32).toString('hex');
const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
const origin='https://lifetime-test.example.com';
const rpc=async(name,args)=>{const entries=Object.entries(args);return (await service(db,`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;};
async function paidWithLink(night,email) {
 const a=attempt(night,email);const c={id:a.id,management:a.management,arrival:a.arrival,issued:Date.now()};
 await rpc('prepare_launch_checkout',{p_id:a.id,p_night:night,p_email:a.email,p_name:a.name,p_locale:a.locale,p_policy:a.policy,p_late_ack:a.late,p_management_secret:a.management,p_arrival_secret:a.arrival,p_envelope:sealCredential(c,'delivery'),p_account:'acct_lifetime',p_origin:origin});
 await pay(db,a);const job=await rpc('claim_launch_access_mail',{p_origin:origin,p_recipients:[a.email]});
 const token=randomBytes(32).toString('hex');const b=await rpc('bind_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_token:token,p_envelope:sealAccessProof({token})});
 await rpc('finish_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_state:'sent',p_provider:'provider_lifetime'});
 return {a,link:{id:job.id,token:openAccessProof(b.token_envelope).token}};
}
const expiries=async id=>(await db.query(`select c.management_expires_at credential,m.token_expires_at token,n.closes_at closes from private.launch_credentials c
 join private.launch_reservations r on r.id=c.reservation_id join public.venue_nights n on n.id=r.night_id
 join private.launch_access_mail m on m.reservation_id=r.id where c.reservation_id=$1`,[id])).rows[0];
const elapse=async(id,interval)=>{
 await db.query('update private.launch_credentials set management_expires_at=management_expires_at-$2::interval where reservation_id=$1',[id,interval]);
 await db.query('update private.launch_access_mail set token_expires_at=token_expires_at-$2::interval,credential_expires_at=credential_expires_at-$2::interval where reservation_id=$1',[id,interval]);
};
try {
 await installLaunchSchema(db,{accessUntilNightEnd:false});
 const early=await fixture(db,{capacity:3,start:'10 days',end:'10 days 6 hours'});
 const untouched=await paidWithLink(early.night,'untouched@example.com');
 const opened=await paidWithLink(early.night,'opened@example.com');
 // Opened under the old rule: the paying tab was replaced by the link's access.
 const openedAccess=openCredential((await exchangeAccess(rpc,opened.link.id,opened.link.token)).access,'access');
 await assert.rejects(get(db,opened.a),/denied/);
 const soon=await fixture(db,{start:'2 days',end:'2 days 4 hours'});const near=await paidWithLink(soon.night,'near@example.com');
 const before=await expiries(near.a.id);

 await db.query(readFileSync(accessUntilNightEndMigration,'utf8'));

 for (const r of [untouched,opened]) {
  const e=await expiries(r.a.id);const target=new Date(e.closes.getTime()+86400000);
  assert.ok(e.credential>=target&&e.token>=target,'access and link reach a day after the night');
 }
 const after=await expiries(near.a.id);
 assert.deepEqual([after.credential,after.token],[before.credential,before.token],'a later seven-day expiry is never shortened');
 // One hour before the evening starts, everything a guest already held still works.
 await elapse(untouched.a.id,'9 days 23 hours');await elapse(opened.a.id,'9 days 23 hours');
 assert.equal((await get(db,untouched.a)).state,'confirmed');
 assert.equal((await get(db,{id:opened.a.id,management:openedAccess.management})).state,'confirmed');
 const late=openCredential((await exchangeAccess(rpc,untouched.link.id,untouched.link.token)).access,'access');
 assert.equal(late.management,untouched.a.management,'an unopened link now shares the paying tab access');
 const reopened=openCredential((await exchangeAccess(rpc,opened.link.id,opened.link.token)).access,'access');
 assert.equal(reopened.management,openedAccess.management,'an opened link still hands out the same access');
 assert.equal(await scalar(db,"select count(*)::int from private.launch_credentials where management_expires_at<=clock_timestamp()"),0);
 console.log('PASS #476 existing data: seven-day access and links extended to the night, still bound, never shortened');
} finally {await pg.close();}
