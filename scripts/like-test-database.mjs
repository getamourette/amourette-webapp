import { readFileSync, readdirSync } from 'node:fs';
export const read = path => readFileSync(path, 'utf8');
// Use the actual latest function definitions, including existing moderation and
// lifecycle behavior, on a small Supabase/Auth substrate. No shared DB is used.
export async function installLikeSchema(db, beforeCutover) {
  const roles = (await db.query("select rolname from pg_roles where rolname in ('anon','authenticated','service_role')")).rows;
  let substrate = read('tests/helpers/photo-schema.sql');
  for (const { rolname } of roles) substrate = substrate.replace(new RegExp(`create role ${rolname}(?: bypassrls)?;`), '');
  await db.query(substrate);
  await db.query(read('tests/helpers/like-schema.sql'));
  await db.query(read('supabase/migrations/20260908000001_photo_moderation.sql'));
  const wanted = new Set([
    'public.check_in','private.transition_venue_night','public.run_venue_night_lifecycle',
    'public.set_venue_live','public.update_venue_night_schedule','public.save_venue_configuration',
    'public.delete_venue_configuration','public.eject_from_venue','public.moderate_case','public.submit_report',
    'public.submit_profile_photo','public.decide_profile_photo','public.handle_new_like',
    'private.record_match_event','private.night_ends_at','public.close_interactions_after_block',
  ]);
  const definitions = new Map();
  for (const file of readdirSync('supabase/migrations').sort()) {
    if (file >= '20260918000001') break;
    const source = read(`supabase/migrations/${file}`);
    const regex = /create(?: or replace)? function\s+([\w.]+)\s*\([\s\S]*?\bas\s+(\$\w*\$)[\s\S]*?\2\s*;/gi;
    for (const match of source.matchAll(regex)) if(wanted.has(match[1].toLowerCase())) definitions.set(match[1].toLowerCase(),match[0]);
  }
  for (const name of wanted) {
    if (!definitions.has(name)) throw new Error(`Missing real function ${name}`);
    await db.query(definitions.get(name).replace(/^create function/i,'create or replace function'));
  }
  await db.query(`create trigger likes_create_match after insert on likes for each row execute function handle_new_like();
    create trigger blocks_close_interactions after insert on blocks for each row execute function close_interactions_after_block();`);
  await db.query(read('supabase/migrations/20260918000001_mutual_discovery_authorization.sql'));
  if (beforeCutover) await beforeCutover();
  await db.query(read('supabase/migrations/20260918000002_like_write_authorization.sql'));
  await db.query(read('supabase/migrations/20260921000001_like_cascade_invalidation.sql'));
}
export async function seedPair(db) {
  const [a,b,c,venue,night] = Array.from({length:5},()=>crypto.randomUUID());
  for(const user of [a,b,c]) {
    await db.query('insert into auth.users values($1)',[user]);
    await db.query("insert into profiles(id,first_name,photo_url,gender,interested_in) values($1,'Test',$2,'woman',array['woman'])",[user,`${user}/test.jpg`]);
  }
  await db.query('insert into venues(id) values($1)',[venue]);
  await db.query('insert into venue_nights(id,venue_id) values($1,$2)',[night,venue]);
  for (const user of [a,b,c]) await db.query('insert into presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)',[user,venue,night]);
  return {a,b,c,venue,night};
}
export async function identify(db,id) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id ?? '']);
  await db.query('set role authenticated');
}
export async function token(db,actor,venue,target) {
  await identify(db,actor);
  try {return (await db.query('select * from room_candidates($1)',[venue])).rows.find(row=>row.id===target)?.like_token;}
  finally {await db.query('reset role');}
}
export async function command(db,{actor,target,night,token:authorization,action='like',request=crypto.randomUUID()}) {
  await identify(db,actor);
  try {return (await db.query('select * from write_like($1,$2,$3,$4,$5)',[night,target,action,request,authorization??null])).rows[0];}
  finally {await db.query('reset role');}
}
