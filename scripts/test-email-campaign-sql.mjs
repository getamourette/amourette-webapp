import { PGlite } from '@electric-sql/pglite';
import { installCampaignSchema } from './campaign-test-database.mjs';
import assert from 'node:assert/strict';
const db = new PGlite();
await installCampaignSchema(db);
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const founder = id(1), outsider = id(2), night = id(10), otherNight = id(11);
await db.query('insert into auth.users select unnest($1::uuid[])', [[founder, outsider, id(3), id(4), id(5), id(6), id(7)]]);
await db.query('insert into admins values($1)', [founder]);
await db.query("insert into venues values($1,'Le Bar','Paris','Europe/Paris',false)", [id(9)]);
for (const n of [night, otherNight]) await db.query("insert into venue_nights values($1,$2,'closed',null,now()+interval '20 days',now()+interval '20 days 1 hour',now()+interval '20 days 5 hours')", [n, id(9)]);
for (const [user, email, locale, age] of [[outsider,'same@example.com','en','2 days'],[id(3),'same@example.com','fr','1 day'],[id(4),'other@example.com','es','1 day'],[id(5),'suppressed@example.com','en','1 day']]) {
  await db.query("insert into email_subscriptions(user_id,email,locale,source,consent_version,subscribed_at) values($1,$2,$3,'landing','2026-07-24',now()-$4::interval)", [user,email,locale,age]);
}
await db.exec("insert into email_suppressions(email,reason,suppressed_at) values('suppressed@example.com','complaint',now())");
const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$'+(i+1)).join(',')}) result`, args)).rows[0].result;
const context = await rpc('admin_email_campaign_context',[founder,[night]]);
assert.deepEqual(context.audience, {eligible:2,en:0,fr:1,es:1,frequency:0,suppressed:1});
await assert.rejects(() => rpc('admin_email_campaign_context',[outsider,[night]]), /not_authorized/);
for (const ids of [null,[],[night,night],[null],Array.from({length:21},(_,i)=>id(i+100)),[id(999)]]) {
  await assert.rejects(() => rpc('admin_email_campaign_context',[founder,ids]), /invalid_nights|nights_changed/);
}
// Test/started nights cannot enter a draft.
await db.query('update venues set is_test_venue=true where id=$1',[id(9)]);
await assert.rejects(() => rpc('admin_email_campaign_context',[founder,[night]]),/nights_changed/);
await db.query('update venues set is_test_venue=false where id=$1',[id(9)]);
await db.query("update venue_nights set status='waiting' where id=$1",[night]);
await assert.rejects(() => rpc('admin_email_campaign_context',[founder,[night]]),/nights_changed/);
await db.query("update venue_nights set status='closed' where id=$1",[night]);
const message = {subject:'Your next Amourette night', html:'<a href="https://getamourette.com/unsubscribe?token=CAMPAIGN_PREVIEW">Preferences</a>',text:'https://getamourette.com/unsubscribe?token=CAMPAIGN_PREVIEW'};
const messages = {en:message,fr:message,es:message};
const prepare = async (n = night) => {
  const ctx = await rpc('admin_email_campaign_context',[founder,[n]]);
  return rpc('admin_prepare_email_campaign',[founder,[n],JSON.stringify(ctx.nights),JSON.stringify(messages)]);
};
await assert.rejects(() => rpc('admin_prepare_email_campaign',[founder,[night],JSON.stringify(context.nights),JSON.stringify({en:message})]), /invalid_messages/);
assert.equal((await db.query('select count(*)::int n from email_campaigns')).rows[0].n,0);
await assert.rejects(() => rpc('admin_prepare_email_campaign',[founder,[night],'[]',JSON.stringify(messages)]),/nights_changed/);
const draft = await prepare();
const confirm = (c = draft, audience = c.audience) => rpc('admin_confirm_email_campaign',[founder,c.campaign.id,JSON.stringify(audience)]);
await assert.rejects(() => confirm(draft,{...draft.audience,eligible:999}), /audience_changed/);
assert.equal((await db.query('select count(*)::int n from email_deliveries')).rows[0].n,0);
const sent = await confirm();
assert.equal(sent.counts.queued,2);
assert.equal((await confirm()).id, sent.id, 'confirmation replay returns same campaign');
assert.equal((await db.query('select count(*)::int n from email_deliveries')).rows[0].n,2);
assert.equal((await rpc('admin_email_campaign_context',[founder,[night]])).audience.eligible,0);
const second = await prepare(otherNight);
await assert.rejects(() => confirm(second),/empty_audience/);
await assert.rejects(() => db.query("insert into email_deliveries(kind,campaign_id,recipient_email,locale,idempotency_key) values('upcoming_nights',$1,'same@example.com','en','bypass')",[draft.campaign.id]),/campaign_frequency_limit/);
const deliveries = (await db.query('select id,recipient_email,locale from email_deliveries order by recipient_email')).rows;
const duplicate = deliveries.find(d=>d.recipient_email==='same@example.com');
assert.equal(duplicate.locale,'fr','latest active subscription wins');
// Revocation after queue is refused at claim.
await db.exec("update email_subscriptions set status='unsubscribed',unsubscribed_at=now() where email='same@example.com'");
assert.equal(await rpc('claim_email_delivery',[duplicate.id]),null);
const other = deliveries.find(d=>d.recipient_email==='other@example.com');
const claim = await rpc('claim_email_delivery',[other.id]);
assert.deepEqual(claim.message,message,'transport gets frozen reviewed message');
assert.equal(await rpc('claim_email_delivery',[other.id]),null,'claim is exclusive');
// Revocation during message preparation is refused immediately before transport.
await db.exec("update email_subscriptions set status='unsubscribed',unsubscribed_at=now() where email='other@example.com'");
assert.equal(await rpc('authorize_email_transport',[other.id]),false);
assert.equal((await rpc('admin_review_email_campaign',[founder,draft.campaign.id])).campaign.counts.skipped,2);
// New consent still cannot bypass the seven-day reservation.
await db.exec("update email_subscriptions set status='subscribed',unsubscribed_at=null,subscribed_at=now() where email in ('same@example.com','other@example.com')");
assert.equal((await rpc('admin_email_campaign_context',[founder,[night]])).audience.eligible,0);
// Advancing the clock through fixture timestamps: exactly seven days is allowed.
// Disable only immutability for fixture time travel, never the actual command path.
await db.exec("alter table email_deliveries disable trigger guard_campaign_delivery; update email_deliveries set created_at=now()-interval '7 days'; alter table email_deliveries enable trigger guard_campaign_delivery");
assert.equal((await rpc('admin_email_campaign_context',[founder,[night]])).audience.eligible,2);
const later = await prepare(); await confirm(later);
await assert.rejects(() => db.query("update email_deliveries set locale='en' where campaign_id=$1",[later.campaign.id]),/immutable_campaign_delivery/);
const laterRows = (await db.query('select id from email_deliveries where campaign_id=$1 order by id',[later.campaign.id])).rows;
await db.query("update email_deliveries set status='unknown',last_error_code='transport_ambiguous' where id=$1",[laterRows[0].id]);
await db.query("update email_deliveries set status='failed',last_error_code='resend_http_429' where id=$1",[laterRows[1].id]);
assert.equal(await rpc('admin_retry_email_campaign',[founder,later.campaign.id]),1);
assert.equal((await db.query('select status from email_deliveries where id=$1',[laterRows[0].id])).rows[0].status,'unknown');
// A changed schedule invalidates approval, and existing queue items are skipped.
await db.query("update email_deliveries set status='failed',provider_message_id='known',last_error_code='resend_http_429' where id=$1",[laterRows[1].id]);
assert.equal(await rpc('admin_retry_email_campaign',[founder,later.campaign.id]),0,'provider-known failures cannot retry');
await db.query("update email_deliveries set status='queued',provider_message_id=null where id=$1",[laterRows[1].id]);
const stale = await prepare(otherNight);
await db.query("update venue_nights set closes_at=closes_at+interval '1 hour' where id=$1",[otherNight]);
await assert.rejects(() => rpc('admin_review_email_campaign',[founder,stale.campaign.id]),/nights_changed/);
await assert.rejects(() => confirm(stale),/nights_changed/);
await db.query("update venue_nights set terminal_at=now() where id=$1",[night]);
await assert.rejects(() => rpc('admin_retry_email_campaign',[founder,later.campaign.id]),/nights_changed/);
assert.equal(await rpc('claim_email_delivery',[laterRows[1].id]),null);
// Welcome deliveries retain their old rendering/claim semantics.
await db.exec("insert into email_deliveries(kind,recipient_email,locale,idempotency_key) values('welcome','same@example.com','en','welcome-test')");
const welcome = (await db.query("select id from email_deliveries where kind='welcome'")).rows[0].id;
assert.equal((await rpc('claim_email_delivery',[welcome])).kind,'welcome');
assert.equal(await rpc('authorize_email_transport',[welcome]),true);
const dash = await rpc('admin_email_campaign_dashboard',[founder,0]);
assert.ok(!JSON.stringify(dash).includes('@example.com'),'founder projection never exposes addresses');
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => rpc('admin_email_campaign_dashboard',[founder,0]),/permission denied/);
  await assert.rejects(() => rpc('admin_confirm_email_campaign',[founder,draft.campaign.id,'{}']),/permission denied/);
  for (const table of ['email_campaigns','email_campaign_nights','email_deliveries']) await assert.rejects(() => db.query(`select * from ${table}`),/permission denied/);
  await db.exec('reset role');
}
await db.close();
console.log('Campaign SQL: authorization, deduplication, consent, frequency, frozen previews, safe retry and stale nights passed.');
