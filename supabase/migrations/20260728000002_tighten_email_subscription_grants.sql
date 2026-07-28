-- Objects created by the migration role may inherit broad API privileges.
-- Keep authenticated users limited to the operations covered by owner RLS.
revoke all on public.email_subscriptions from authenticated;
grant select, insert, update, delete on public.email_subscriptions to authenticated;
