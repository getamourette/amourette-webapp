-- The isolated lifecycle regression runner creates a temporary authenticated
-- admin and removes it in guaranteed cleanup. MCP-created objects do not inherit
-- Supabase's usual service-role grants, so grant only the two operations needed.

grant insert, delete on public.admins to service_role;
