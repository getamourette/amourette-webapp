import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { installLikeSchema } from './like-test-database.mjs';
const read = path => readFileSync(path, 'utf8');
export const founder = '00000000-0000-0000-0000-000000000182';
export const stranger = '00000000-0000-0000-0000-000000000184';
export async function installLaunchSchema(db, { existing = false } = {}) {
  if (!existing) await installLikeSchema(db);
  // Reuse production input validators without the unrelated #77 alterations.
  const validation = read('supabase/migrations/20260909000003_input_validation_contract.sql');
  await db.query(validation.slice(0, validation.indexOf('-- Runs before existing')));
  await db.query(read('supabase/migrations/20261007000001_launch_reservations.sql'));
  for (const id of [founder,stranger]) await db.query('insert into auth.users values($1) on conflict do nothing',[id]);
  await db.query('insert into admins(user_id) values($1) on conflict do nothing',[founder]);
}
export async function asRole(db, role, sql, args = [], user = null) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user ?? '']);
  await db.query(`set role ${role}`);
  let failure;
  try { return (await db.query(sql,args)).rows; }
  catch(error) { failure=error; throw error; }
  finally { try { await db.query('reset role'); } catch(error) { if(!failure) throw error; } }
}
export const service = (db,sql,args=[]) => asRole(db,'service_role',sql,args);
export const admin = (db,sql,args=[]) => asRole(db,'authenticated',sql,args,founder);
export async function fixture(db, { capacity=1, start='4 days', end='4 days 4 hours', opens='-1 hour' }={}) {
  const venue=randomUUID(),night=randomUUID();
  await db.query('insert into venues(id,timezone) values($1,\'Europe/Paris\')',[venue]);
  await db.query(`insert into venue_nights(id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status,opened_at,launched_at)
    values($1,$2,clock_timestamp()+$3::interval,clock_timestamp()+$3::interval+interval '1 hour',clock_timestamp()+$4::interval,'closed',null,null)`,[night,venue,start,end]);
  // Fixture setup alone may open in the past. Real founder command forbids it.
  await db.query(`insert into private.launch_events values($1,clock_timestamp()+$2::interval,$3,1000,'eur','launch-v1',null,null)`,[night,opens,capacity]);
  return {venue,night};
}
export function attempt(night, email=`${randomUUID()}@example.com`) {
  return {id:randomUUID(),night,email,name:'Alice',locale:'en',policy:'launch-v1',late:true,
    until:new Date(Date.now()+30*60*1000).toISOString(),management:randomBytes(32).toString('hex'),arrival:randomBytes(32).toString('hex')};
}
export const create = async(db,a) => (await service(db,'select create_launch_reservation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',Object.values(a)))[0].result;
export const get = async(db,a) => (await service(db,'select get_launch_reservation($1,$2) result',[a.id,a.management]))[0].result;
export const cancel = async(db,a) => (await service(db,'select cancel_launch_reservation($1,$2) result',[a.id,a.management]))[0].result;
export const checkout = a => `cs_${a.id.replaceAll('-','')}`;
export const payment = a => `pi_${a.id.replaceAll('-','')}`;
export async function pay(db,a) {
  await service(db,'select bind_launch_checkout($1,$2)',[a.id,checkout(a)]);
  return (await service(db,'select record_launch_payment($1,$2,$3,1000,\'eur\') result',[a.id,checkout(a),payment(a)]))[0].result;
}
export const scalar = async(db,sql,args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
