-- Final behavioral boundary: clients can still read their own consent, but direct
-- INSERT/UPDATE/DELETE is revoked in favor of the audited server route + RPC.
drop policy if exists "Owners can create their email subscription" on public.email_subscriptions;
drop policy if exists "Owners can update their email subscription" on public.email_subscriptions;
drop policy if exists "Owners can delete their email subscription" on public.email_subscriptions;
revoke insert, update, delete on public.email_subscriptions from authenticated;
