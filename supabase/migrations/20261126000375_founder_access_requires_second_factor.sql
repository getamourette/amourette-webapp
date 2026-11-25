-- #374 (SEC-011), second step: founder access requires the second factor.
-- private.is_admin() is the single gate behind every admin RPC, policy and the
-- am_i_admin() client check. It now also requires an aal2 session, which
-- Supabase Auth issues only after a TOTP code. A stolen password alone yields
-- aal1 and is refused by the database, not only by the interface.
--
-- Merge only after every founder who needs access has enrolled an
-- authenticator on production (docs/admin-password-management.md): the merge
-- workflow applies this before anyone can react. A founder without a factor is
-- then offered setup by /admin (public.founder_second_factor_needed()).
create or replace function private.is_admin()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and exists (
      select 1 from public.admins a
      where a.user_id = (select auth.uid())
    )
$$;
