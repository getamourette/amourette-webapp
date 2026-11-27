// #376 (SEC-013): free anonymous sessions cannot make the server work without
// bound. Real migration on an isolated PGlite database with the real write_like;
// the photo quota helper runs against a local fake PostgREST. No shared service.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { installLikeSchema, seedPair, token, command } from './like-test-database.mjs';
// @ts-expect-error -- Node source entry.
import { claimPhotoUploadTicket } from '../lib/server/photo-service.ts';
// @ts-expect-error -- Node source entry.
import { reviewProfilePhoto } from '../lib/server/photo-review.ts';

const migration = 'supabase/migrations/20261129000520_anonymous_abuse_quotas.sql';
const pg = new PGlite();
const db = { query: (sql: string, args?: unknown[]) => args ? pg.query(sql, args) : pg.exec(sql).then(results => results.at(-1)!) };
const scalar = async (sql: string, args: unknown[] = []) => Object.values((await pg.query<Record<string, unknown>>(sql, args)).rows[0])[0];
const check = async (name: string, fn: () => Promise<void>) => { await fn(); console.log('PASS ' + name); };
const asService = async <T,>(fn: () => Promise<T>) => { await pg.exec('set role service_role'); try { return await fn(); } finally { await pg.exec('reset role'); } };
const claim = (owner: string) => asService(() => scalar('select public.claim_photo_upload_ticket($1)', [owner]));

try {
  await installLikeSchema(db);
  // The analytics table as #17 created it, reduced to the columns the bound reads.
  await pg.exec(`create table public.analytics_events(id uuid primary key default gen_random_uuid(), event_name text not null,
    user_id uuid references auth.users(id) on delete set null, session_id text not null, occurred_at timestamptz not null default now());`);
  await pg.exec("insert into storage.buckets(id,public) values('profile-photo-staging',false) on conflict do nothing");
  await pg.exec(readFileSync(migration, 'utf8'));

  await check('photo upload tickets: 30 an hour per account, the 31st is refused and the budget frees up after an hour', async () => {
    const { a, b } = await seedPair(db);
    for (let i = 0; i < 30; i++) assert.equal(await claim(a), true, `ticket ${i + 1}`);
    assert.equal(await claim(a), false, 'the 31st ticket in the hour is refused');
    assert.equal(await claim(b), true, 'another account keeps its own budget');
    await pg.query("update private.photo_upload_tickets set created_at=created_at-interval '61 minutes' where owner_id=$1", [a]);
    assert.equal(await claim(a), true);
    assert.equal(await scalar('select count(*)::int from private.photo_upload_tickets where owner_id=$1', [a]), 1, 'expired rows are pruned');
  });
  await check('no new ticket while ten staging objects of the account are waiting', async () => {
    const { a } = await seedPair(db);
    for (let i = 0; i < 9; i++) await pg.query("insert into storage.objects(bucket_id,name) values('profile-photo-staging',$1)", [`${a}/${i}.jpg`]);
    await pg.query("insert into storage.objects(bucket_id,name) values('profile-photos',$1)", [`${a}/published.webp`]);
    assert.equal(await claim(a), true, 'nine waiting objects and a published photo still allow one');
    await pg.query("insert into storage.objects(bucket_id,name) values('profile-photo-staging',$1)", [`${a}/9.jpg`]);
    assert.equal(await claim(a), false, 'the tenth waiting object stops new tickets');
    await pg.query("delete from storage.objects where name like $1", [`${a}/%`]);
    assert.equal(await claim(a), true, 'collected objects free the budget');
  });
  await check('only the server can claim a ticket', async () => {
    const { a } = await seedPair(db);
    for (const role of ['authenticated', 'anon']) {
      await pg.exec(`set role ${role}`);
      try { await assert.rejects(pg.query('select public.claim_photo_upload_ticket($1)', [a]), /permission denied/); }
      finally { await pg.exec('reset role'); }
    }
    await assert.rejects(asService(() => pg.query('select public.claim_photo_upload_ticket(null)')), /invalid photo upload owner/);
  });
  await check('like requests: 500 receipts per participant and night, the 501st is refused by write_like', async () => {
    const { a, b, venue, night } = await seedPair(db);
    const authorization = await token(pg, a, venue, b);
    assert.ok(authorization);
    // 499 earlier requests of the night, then two through the real command.
    await pg.query(`insert into private.like_request_receipts(actor_id,request_id,venue_night_id,target_id,action,token,accepted)
      select $1,gen_random_uuid(),$2,$3,'unlike',null,true from generate_series(1,499)`, [a, night, b]);
    assert.equal((await command(pg, { actor: a, target: b, night, token: authorization })).accepted, true, 'the 500th request still works');
    await assert.rejects(command(pg, { actor: a, target: b, night, token: null, action: 'unlike' }), /like request limit reached/);
    assert.equal(await scalar('select count(*)::int from private.like_request_receipts where actor_id=$1', [a]), 500);
    assert.equal(await scalar('select count(*)::int from likes where liker_id=$1', [a]), 1, 'the refused unlike changed nothing');
  });
  await check('analytics: 120 events an hour per account, older events do not count', async () => {
    const { a } = await seedPair(db);
    await pg.query("insert into public.analytics_events(event_name,user_id,session_id,occurred_at) select 'landing_viewed',$1,'session-1',now()-interval '2 hours' from generate_series(1,50)", [a]);
    await pg.query("insert into public.analytics_events(event_name,user_id,session_id) select 'landing_viewed',$1,'session-1' from generate_series(1,120)", [a]);
    await assert.rejects(pg.query("insert into public.analytics_events(event_name,user_id,session_id) values('landing_viewed',$1,'session-1')", [a]), /analytics event limit reached/);
    await pg.query("insert into public.analytics_events(event_name,user_id,session_id) values('landing_viewed',null,'session-2')");
  });

  // The route answers 429 for `too_many_uploads` and 503 for anything unreadable.
  await check('the photo routes read the quota as allowed, too many or unavailable', async () => {
    let answer: string = 'true';
    const server = createServer((request, response) => {
      assert.equal(request.url, '/rest/v1/rpc/claim_photo_upload_ticket');
      response.writeHead(answer === 'error' ? 500 : 200, { 'content-type': 'application/json' }).end(answer === 'error' ? '{"message":"boom"}' : answer);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
    try {
      assert.equal(await claimPhotoUploadTicket(crypto.randomUUID()), 'allowed');
      answer = 'false'; assert.equal(await claimPhotoUploadTicket(crypto.randomUUID()), 'too_many_uploads');
      answer = 'error'; assert.equal(await claimPhotoUploadTicket(crypto.randomUUID()), 'upload_unavailable');
      answer = '"yes"'; assert.equal(await claimPhotoUploadTicket(crypto.randomUUID()), 'upload_unavailable');
    } finally { server.close(); }
    for (const route of ['upload', 'prepare']) {
      const source = readFileSync(`app/api/profile-photo/${route}/route.ts`, 'utf8');
      assert.match(source, /claimPhotoUploadTicket\(user\.id\)[\s\S]*quota === 'too_many_uploads' \? 429 : 503[\s\S]*createSignedUploadUrl/, `${route} checks the quota before signing an upload`);
    }
  });

  await check('the public review route is gone; publication keeps rejecting a disapproved photo', async () => {
    assert.equal(existsSync('app/api/profile-photo/review/route.ts'), false, 'no public POST /api/profile-photo/review');
    const realFetch = globalThis.fetch;
    let reply: Response = new Response('{}');
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return reply.clone(); }) as typeof fetch;
    process.env.OPENAI_API_KEY = 'test-key';
    try {
      const body = (approved: boolean) => JSON.stringify({ output_text: JSON.stringify({ approved, reason: 'test' }) });
      reply = new Response(body(false)); assert.deepEqual(await reviewProfilePhoto(new Uint8Array([1])), { approved: false });
      reply = new Response(body(true)); assert.deepEqual(await reviewProfilePhoto(new Uint8Array([1])), { approved: true });
      reply = new Response('not json at all'); assert.deepEqual(await reviewProfilePhoto(new Uint8Array([1])), { failed: 'invalid_review' });
      reply = new Response('{}', { status: 500 }); assert.deepEqual(await reviewProfilePhoto(new Uint8Array([1])), { failed: 'provider' });
      delete process.env.OPENAI_API_KEY;
      const before = calls;
      assert.deepEqual(await reviewProfilePhoto(new Uint8Array([1])), { failed: 'not_configured' });
      assert.equal(calls, before, 'no provider call without a key');
    } finally { globalThis.fetch = realFetch; }
    const publication = readFileSync('app/api/profile-photo/route.ts', 'utf8');
    assert.match(publication, /if \(isPhotoReviewEnabled\(\)\) \{[\s\S]*?claimPhotoUploadTicket\(user\.id\)[\s\S]*?too_many_uploads' \? 429 : 503[\s\S]*?reviewProfilePhoto\(/,
      'each reviewed publication claims the quota before the paid call');
    const sql = readFileSync(migration, 'utf8');
    for (const key of ['like-receipts:', 'analytics-events:']) assert.match(sql, new RegExp(`pg_advisory_xact_lock\\(hashtextextended\\('${key}`), `${key} count and insert are serialized`);
    assert.match(publication, /if \('failed' in result\) return Response\.json\(\{ error: 'precheck_failed' \}, \{ status: 503 \}\);\s*if \(!result\.approved\) return Response\.json\(\{\}, \{ status: 422 \}\);/);
  });
  console.log('Anonymous abuse quotas: 7 groups passed.');
} finally {
  await pg.close();
}
