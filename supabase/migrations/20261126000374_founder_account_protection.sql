-- #374 (SEC-011) and #196, first step: close email sign-up without touching
-- anonymous guests, and leave only founders in public.admins. Requiring a
-- second factor in private.is_admin() is a later migration, merged only once
-- the founder has enrolled one (docs/admin-password-management.md).

-- 1. Before User Created hook. Supabase's "Allow new users to sign up" switch
--    also refuses signInAnonymously(), which every guest uses, so sign-up is
--    closed here instead: anonymous sign-ups pass, every other self-service
--    creation (email or phone sign-up, magic link, invite) is refused. Admin
--    API creation (dashboard "Create new user", E2E fixtures) does not call the
--    hook. Inert until the hook is enabled in Authentication > Auth Hooks.
--    Supabase calls it as supabase_auth_admin; no API role may execute it.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce((event #>> '{user,is_anonymous}')::boolean, false) then '{}'::jsonb
    else jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign-up is closed.'))
  end
$$;

comment on function public.hook_before_user_created(jsonb) is
  'Supabase Auth Before User Created hook: only anonymous sign-ups are accepted (#374).';

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- 2. Stale E2E fixture rows (SEC-011). Interrupted test runs left founder rows
--    for synthetic users on development. A fixture user is identified by both
--    markers the fixtures always set: an address at the reserved example.com
--    domain (RFC 2606, no real mailbox) and the e2e_run tag in app metadata,
--    which only the service role can write. Production was built from
--    migrations and never seeded, so this is expected to delete no row there.
delete from public.admins a
using auth.users u
where u.id = a.user_id
  and lower(u.email) like '%@example.com'
  and u.raw_app_meta_data ? 'e2e_run';
