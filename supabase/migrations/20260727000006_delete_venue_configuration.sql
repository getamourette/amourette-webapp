-- Founder-only permanent venue deletion. Permanent QA fixtures are protected;
-- typed confirmation is enforced by the admin UI before this RPC is called.

create or replace function public.delete_venue_configuration(p_venue_id uuid)
returns void language plpgsql security definer set search_path=public,private
as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if exists(select 1 from public.venues where id=p_venue_id and is_test_venue) then
    raise exception 'test venues cannot be deleted';
  end if;
  delete from public.venues where id=p_venue_id;
  if not found then raise exception 'venue not found'; end if;
end;
$$;

revoke execute on function public.delete_venue_configuration(uuid) from anon,public;
grant execute on function public.delete_venue_configuration(uuid) to authenticated;
