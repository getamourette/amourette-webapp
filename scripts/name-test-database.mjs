import { read } from './like-test-database.mjs';
export async function installNameSchema(db) {
  // Use the production validators rather than a test-only approximation.
  const validation = read('supabase/migrations/20260909000003_input_validation_contract.sql');
  for (const name of ['trim_input','valid_input_text']) {
    const expression = new RegExp(`create or replace function private\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i');
    await db.query(validation.match(expression)[0]);
  }
  await db.query(read('supabase/migrations/20260921000002_profile_name_corrections.sql'));
}
export async function asUser(db, user, sql, args = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.query('set role authenticated');
  try { return (await db.query(sql,args)).rows; }
  finally { await db.query('reset role'); }
}
