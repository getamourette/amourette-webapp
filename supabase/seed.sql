-- Dev seed data. Not schema — safe to re-run (idempotent).
-- Stand-in venues for testing. `timezone` drives the nightly rollover that ends
-- the room at 06:00 local (see the bloc1_night_rollover migration). Replace with
-- the real Phase 1 venues later.

insert into public.venues (slug, name, city, timezone) values
  ('paris-test', 'Bartap Test (Paris)', 'Paris',    'Europe/Paris'),
  ('nyc-test',   'Bartap Test (NYC)',   'New York', 'America/New_York')
on conflict (slug) do nothing;
