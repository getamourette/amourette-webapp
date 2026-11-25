// #483 (Z5-M10): approving a photo that was already displayed (a guest's first
// photo) must not tell the guest "New photo approved". Only the approval of a
// pending replacement writes last_action='approved', which opens that sheet.
// Executes the real migrations on an isolated PGlite foundation; no shared DB.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { read, seedPair } from './like-test-database.mjs';
import { asUser } from './name-test-database.mjs';
import { installTextModerationSchema } from './text-moderation-test-database.mjs';

const db = new PGlite();
const adapter = { query: (sql, args) => args ? db.query(sql, args) : db.exec(sql).then(results => results.at(-1)) };
try {
  await installTextModerationSchema(adapter);
  await db.exec(read('supabase/migrations/20261003000001_unified_profile_review.sql'));
  await db.exec(read('supabase/migrations/20261023000001_review_photo_replacement.sql'));
  await db.exec(read('supabase/migrations/20261128000500_photo_first_approval_status.sql'));
  const { a: first, b: replacing, c: founder } = await seedPair(adapter);
  await db.query('insert into admins values($1)', [founder]);
  const state = async id => (await db.query('select * from photo_state where profile_id=$1', [id])).rows[0];
  const decide = (owner, version, revision) => asUser(db, founder, 'select decide_profile_photo($1,$2,$3,$4,$5)', [owner, version, revision, 'approved', null]);

  // A first photo is displayed unverified from the start, as onboarding leaves it.
  await db.query("update photo_state set last_action='submitted' where profile_id=$1", [first]);
  const shown = await state(first);
  assert.ok(shown.displayed_id && !shown.pending_id, 'fixture: a displayed first photo, nothing pending');
  assert.equal((await db.query('select status from photo_versions where id=$1', [shown.displayed_id])).rows[0].status, 'unverified');
  await decide(first, shown.displayed_id, shown.revision);
  const approved = await state(first);
  assert.notEqual(approved.last_action, 'approved', 'approving the displayed first photo must not announce a new photo');
  assert.equal(approved.last_action, null);
  assert.equal(approved.revision, shown.revision + 1, 'the decision still moves the revision');
  assert.equal(approved.displayed_id, shown.displayed_id);
  assert.equal((await db.query('select status from photo_versions where id=$1', [shown.displayed_id])).rows[0].status, 'approved');
  assert.equal((await db.query("select count(*)::int n from photo_audit where profile_id=$1 and action='approved'", [first])).rows[0].n, 1, 'the audit keeps the approval');

  // A replacement waiting for review is a new photo: its approval is announced.
  const before = await state(replacing);
  const pending = crypto.randomUUID();
  await db.query("insert into photo_versions(id,profile_id,path,status) values($1,$2,$3,'unverified')", [pending, replacing, `${replacing}/replacement.jpg`]);
  await db.query("update photo_state set pending_id=$2,last_action='submitted' where profile_id=$1", [replacing, pending]);
  await decide(replacing, pending, before.revision);
  const replaced = await state(replacing);
  assert.equal(replaced.last_action, 'approved', 'approving a pending replacement still announces the new photo');
  assert.equal(replaced.displayed_id, pending);
  assert.equal(replaced.pending_id, null);
  console.log('photo first approval: a displayed first photo is approved silently, a replacement is announced');
} finally {
  await db.close();
}
