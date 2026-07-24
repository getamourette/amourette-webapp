-- MCP-created objects do not inherit Supabase default privileges. The lifecycle
-- regression uses service_role to inspect audit rows and relies on cascade
-- cleanup through venue_nights; it needs no audit-table write privilege.
grant select on public.venue_night_configuration_audits to service_role;

-- Cover the auth.users foreign key reported by the performance advisor.
create index venue_night_configuration_audits_by_actor
  on public.venue_night_configuration_audits (actor_id)
  where actor_id is not null;
