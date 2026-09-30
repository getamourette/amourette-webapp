import { read } from './like-test-database.mjs';
import { asUser } from './name-test-database.mjs';
export async function installProfileEditSchema(db) {
  const validation = read('supabase/migrations/20260909000003_input_validation_contract.sql');
  await db.query(validation.match(/create or replace function private\.valid_interests\([\s\S]*?\$\$;/i)[0]);
  await db.query(read('supabase/migrations/20260922000001_profile_preference_cooldown.sql'));
}
export const state = async (db, actor) => (await asUser(db, actor, 'select * from get_my_profile_edit_state()'))[0];
export const edit = async (db, actor, gender, interests, version = null) => (await asUser(db, actor,
  'select * from update_my_profile_preferences($1,$2,$3)', [gender, interests, version]))[0];
