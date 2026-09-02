-- Dev seed data. Not schema — safe to re-run (idempotent).
-- Stand-in venues for testing. `timezone` drives the nightly rollover that ends
-- the room at 06:00 local (see the bloc1_night_rollover migration). Replace with
-- the real Phase 1 venues later.

-- Lightweight stand-ins remain available for ordinary rollover testing. The
-- permanent crowded/empty QA rooms and their profiles are managed by
-- `npm run seed:test-venues` after the always-live migration is applied.
insert into public.venues (slug, name, city, timezone, is_live) values
  ('paris-test', 'Amourette Test (Paris)', 'Paris',    'Europe/Paris',     true),
  ('nyc-test',   'Amourette Test (NYC)',   'New York', 'America/New_York', true)
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  timezone = excluded.timezone,
  is_live = excluded.is_live;
