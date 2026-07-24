-- The lifecycle regression creates uniquely prefixed temporary venues and must
-- remove them (their nights and ephemeral rows cascade) even when a test fails.

grant delete on public.venues to service_role;
