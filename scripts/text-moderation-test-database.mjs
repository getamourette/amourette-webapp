import { read, installLikeSchema } from './like-test-database.mjs';
import { installNameSchema } from './name-test-database.mjs';
import { installProfileEditSchema } from './profile-edit-test-database.mjs';
import { installParticipantSchema } from './participant-test-database.mjs';

export async function installTextModerationSchema(db, beforeMigration) {
  await installLikeSchema(db);
  await installNameSchema(db);
  await installProfileEditSchema(db);
  await installParticipantSchema(db);
  await installTextNormalizer(db);
  // The like substrate omits report IDs because its tests do not read reports.
  await db.query('alter table public.reports add id uuid primary key default gen_random_uuid()');
  if (beforeMigration) await beforeMigration();
  await db.query(read('supabase/migrations/20261001000001_profile_text_moderation.sql'));
}

export async function installTextNormalizer(db) {
  // Install the actual current normalizer and its trigger, absent from the older
  // minimal like substrate. This catches null-name and later bio-write regressions.
  const source = read('supabase/migrations/20260930000010_matching_preference_consent.sql');
  await db.query(source.match(/create or replace function private\.normalize_profile_inputs\([\s\S]*?\$\$;/i)[0]);
  await db.query('create trigger a00_normalize_profile_inputs before insert or update on profiles for each row execute function private.normalize_profile_inputs()');
}
