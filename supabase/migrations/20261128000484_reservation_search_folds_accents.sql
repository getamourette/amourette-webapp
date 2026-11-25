-- #484 (Z5-M15, Z5-M16 search part): door and reservation search ignores accents
-- and case, and matches word by word. Typing "chloe" finds "Chloé"; typing a full
-- name such as "Chloé Martin" finds the reservation stored under the first name
-- "Chloé" (only first names are stored).
-- Behaviour: same arguments, result shape, filters, ordering and pagination; only
-- the text match changes. Plus one new private helper.

-- Lower case without diacritics: NFD splits "é" into "e" + U+0301, then every
-- combining mark (U+0300 to U+036F) is removed. Inputs arriving in NFC or NFD fold
-- to the same text. No extension needed.
create function private.search_fold(value text)
returns text language sql immutable strict parallel safe set search_path = '' as $$
  select lower(regexp_replace(normalize(value, NFD), '[̀-ͯ]', '', 'g'));
$$;
revoke all on function private.search_fold(text) from public, anon, authenticated, service_role;

-- A reservation matches when every word of the query appears in its email, first
-- name or reference, or when its whole first name is one of the query's words
-- (a typed surname is then ignored). Still a substring match: `%` and `_` are
-- plain characters.
create or replace function public.admin_search_launch_reservations(p_night uuid,p_query text default '',p_filter text default 'all',p_after uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; q text; words text[];
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  if p_night is null or p_query is null or not private.valid_input_text(p_query,254,false) or p_filter is null or
    p_filter not in ('all','confirmed','holding','cancelled','expired','paid','unpaid','verified','no_show','refund_due','refunded','attention') then
    raise exception 'invalid reservation search' using errcode='22023'; end if;
  q := private.trim_input(regexp_replace(private.search_fold(p_query), '[[:space:]]+', ' ', 'g'));
  words := case when q = '' then '{}'::text[] else string_to_array(q, ' ') end;
  select coalesce(jsonb_agg(private.launch_projection(t.id) order by t.id),'[]') into result from (
    select r.id from private.launch_reservations r join private.launch_payments p on p.reservation_id=r.id
    left join private.launch_arrivals a on a.reservation_id=r.id
    left join private.launch_refunds f on f.reservation_id=r.id
    left join private.launch_checkout_work w on w.reservation_id=r.id
    where r.night_id=p_night and (p_after is null or r.id>p_after)
    and (q = ''
      or not exists (select 1 from unnest(words) word
        where position(word in private.search_fold(r.email || ' ' || r.first_name || ' ' || r.id::text)) = 0)
      or position(' ' || private.search_fold(private.trim_input(r.first_name)) || ' ' in ' ' || q || ' ') > 0)
    and (p_filter='all' or (p_filter in ('confirmed','holding','cancelled','expired') and r.state=p_filter)
      or (p_filter in ('paid','unpaid') and p.state=p_filter)
      or (p_filter in ('verified','no_show') and a.outcome=p_filter)
      or (p_filter='refund_due' and f.state in ('queued','pending','failed','review_needed'))
      or (p_filter='refunded' and f.state='succeeded')
      or (p_filter='attention' and (f.state in ('failed','review_needed') or w.state='review_needed' or f.last_error='insufficient_funds')))
    order by r.id limit 100
  ) t;
  return result;
end $$;
