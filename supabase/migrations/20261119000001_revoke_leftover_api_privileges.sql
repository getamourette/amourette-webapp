-- A Supabase project grants TRUNCATE, REFERENCES, TRIGGER and MAINTAIN to the
-- API roles on every table the postgres role creates in public, even with
-- "Automatically expose new tables" off. Migrations revoked them on some
-- tables only, so both projects kept them on the others. RLS cannot guard
-- TRUNCATE. No API role needs any of the four: remove the default and what it
-- left behind. Data privileges stay granted per table by the migrations.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

do $$
declare
  target regclass;
begin
  for target in
    select c.oid::regclass
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke truncate, references, trigger, maintain on table %s from anon, authenticated, service_role',
      target
    );
  end loop;
end $$;
