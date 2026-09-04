-- Keep profile names legible on the smallest supported room and chat layouts.
-- This intentionally validates existing rows and never truncates user data.
do $$
begin
  if exists (
    select 1
    from public.profiles
    where length(trim(first_name)) > 30
  ) then
    raise exception 'Cannot limit first_name to 30 characters: existing profiles exceed the limit';
  end if;
end
$$;

alter table public.profiles
  drop constraint if exists profiles_first_name_check;

alter table public.profiles
  add constraint profiles_first_name_check
  check (length(trim(first_name)) between 1 and 30);
