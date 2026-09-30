-- Read-only aggregate preflight. Never returns participant content or identifiers.
-- Run against the intended project before approving the #77 migrations.
with whitespace as (
  select U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' chars
), text_inputs as (
  select 'profiles.first_name' field,first_name value,30 maximum,true required from public.profiles
  union all select 'profiles.bio',bio,500,false from public.profiles
  union all select 'messages.body',body,2000,true from public.messages
  union all select 'reports.note',note,500,reason='other' from public.reports
  union all select 'blocks.note',note,500,false from public.blocks
  union all select 'venue_ejections.note',note,500,false from public.venue_ejections
  union all select 'venues.name',name,120,true from public.venues
), text_counts as (
  select field,count(*) filter (where
    (required and (value is null or btrim(value,chars)='')) or
    (value is not null and (octet_length(value)>16384 or length(btrim(value,chars))>maximum
      or value<>btrim(value,chars) or (not required and btrim(value,chars)='')))
  ) incompatible_rows
  from text_inputs cross join whitespace group by field
), emails as (
  select email,lower(btrim(email,chars)) normalized,source,consent_version
  from public.email_subscriptions cross join whitespace
), email_counts as (
  select count(*) filter(where email<>normalized or octet_length(email)>254 or email collate "C" !~ '^[!-~]+$'
    or length(email)-length(replace(email,'@',''))<>1
    or length(split_part(email,'@',1))>64
    or split_part(email,'@',1) collate "C" !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+([.][a-z0-9!#$%&''*+/=?^_`{|}~-]+)*$'
    or cardinality(string_to_array(split_part(email,'@',2),'.'))<2
    or exists(select 1 from unnest(string_to_array(split_part(email,'@',2),'.')) label where label collate "C" !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
    or split_part(email,'.',-1) ~ '^[0-9]+$') incompatible_emails,
    count(*) filter(where consent_version is distinct from case source when 'landing' then '2026-07-24' when 'subscription_management' then 'email-preferences-v1' else 'global-live-night-email-v1' end) incompatible_consent
  from emails
)
select jsonb_build_object(
 'text',(select jsonb_object_agg(field,incompatible_rows) from text_counts),
 'email',(select to_jsonb(email_counts) from email_counts),
 'preferences',(select count(*) from public.profiles where array_ndims(interested_in) is distinct from 1 or cardinality(interested_in) not between 1 and 3 or not interested_in <@ array['woman','man','nonbinary']::text[] or cardinality(interested_in)<>(select count(distinct g) from unnest(interested_in) g)),
 'venue_location',(select count(*) from public.venues where city is null or not ((city='Paris' and timezone='Europe/Paris') or (city='New York' and timezone='America/New_York'))),
 'venue_slug',(select count(*) from public.venues where slug collate "C" !~ '^[a-z0-9-]{1,80}$'),
 'nonfinite_nights',(select count(*) from public.venue_nights where not(isfinite(waiting_opens_at) and isfinite(guaranteed_launch_at) and isfinite(closes_at))),
 'stored_phone',(select count(*) from public.profile_private where phone is not null)
) preflight;
