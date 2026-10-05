import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { read, seedPair, token } from './like-test-database.mjs';
import { asUser } from './name-test-database.mjs';
import { installTextModerationSchema } from './text-moderation-test-database.mjs';

const db = new PGlite();
const adapter = { query: (sql,args) => args ? db.query(sql,args) : db.exec(sql).then(results=>results.at(-1)) };
try {
  let f;
  await installTextModerationSchema(adapter, async () => {
    f = await seedPair(adapter);
    await db.exec('alter table profiles add constraint profiles_interested_in_check check(private.valid_interests(interested_in))');
    await db.exec(read('supabase/migrations/20260930000010_matching_preference_consent.sql'));
  });
  const grant = async actor => {
    const current=(await asUser(db,actor,'select * from get_my_matching_consent()'))[0];
    const result=await asUser(db,actor,'select * from grant_my_matching_consent($1,$2,$3,$4,$5,$6,$7)',
      ['true','matching-v1-draft','en','woman',['woman'],current.revision,crypto.randomUUID()]);
    assert.equal(result[0].active,true);
    return result;
  };
  await grant(f.a);await grant(f.b);
  await db.query('insert into admins values($1)',[f.c]);
  const review=(await asUser(db,f.c,'select * from admin_text_reviews($1,$2)',[f.a,f.night])).find(r=>r.field==='first_name');
  await asUser(db,f.c,'select require_profile_text_correction($1,$2,$3,$4,$5)',[f.a,'first_name',review.revision,'inappropriate',f.night]);
  await asUser(db,f.a,"update profiles set bio='Independent while name is hidden' where id=$1",[f.a]);
  const consent=(await asUser(db,f.a,'select * from get_my_matching_consent()'))[0];
  await asUser(db,f.a,'select * from withdraw_my_matching_consent($1)',[consent.revision]);
  const request=crypto.randomUUID();
  await asUser(db,f.a,'select submit_name_correction($1,$2)',[request,'Corrected']);
  await asUser(db,f.c,"select * from decide_name_correction($1,'approved')",[request]);
  assert.equal((await asUser(db,f.a,'select * from get_my_matching_consent()'))[0].active,false);
  assert.equal(await token(adapter,f.b,f.venue,f.a),undefined,'name approval cannot restore withdrawn matching consent');
  await grant(f.a);
  assert.ok(await token(adapter,f.b,f.venue,f.a),'fresh consent permits otherwise eligible discovery');
  console.log('Text moderation integrates with the current profile normalizer and consent withdrawal without restoring consent.');
} finally { await db.close(); }
