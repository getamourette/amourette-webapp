-- Bloc 0 — Foundations: lock down the match trigger function.
-- handle_new_like() is SECURITY DEFINER and only ever meant to run as the
-- AFTER INSERT trigger on likes. PostgREST otherwise exposes every public
-- function as an RPC endpoint (/rest/v1/rpc/handle_new_like), so revoke EXECUTE
-- from the API roles. (Calling it outside a trigger context already errors, but
-- we don't want it reachable at all.)

revoke execute on function public.handle_new_like() from anon, authenticated, public;
