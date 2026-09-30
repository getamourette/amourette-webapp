import { read } from './like-test-database.mjs';
export async function installParticipantSchema(db) {
  // Transport capture only; actual migration triggers, grants, reads and RLS run.
  // Hosted tests separately prove Supabase channel authorization and delivery.
  await db.query(`create schema realtime; grant usage on schema realtime to authenticated;
    create table realtime.messages(topic text,extension text,payload jsonb,event text,private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql as $$select current_setting('realtime.topic',true)$$;
    create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as
      $$insert into realtime.messages values(topic,'broadcast',payload||jsonb_build_object('id',gen_random_uuid()),event,private)$$;`);
  await db.query(read('supabase/migrations/20260925000001_participant_invalidation.sql'));
}
