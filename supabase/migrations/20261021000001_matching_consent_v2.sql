-- #323. Additive wording catalog and backward-compatible validation update.
-- Keep v1 accepted so deployed main and in-flight submissions work before merge;
-- preserve its wording/evidence and existing active grants without re-consent.
-- Applying this migration to the shared database remains founder-gated.
begin;

insert into private.matching_consent_wordings values
 ('matching-v2-draft','en','I agree that Amourette uses my gender and preferences for matching.'),
 ('matching-v2-draft','fr','J’accepte qu’Amourette utilise mon genre et mes préférences pour le matching.'),
 ('matching-v2-draft','es','Acepto que Amourette use mi género y mis preferencias para el matching.');

create or replace function private.validate_matching_consent(p_consent boolean,p_version text,p_locale text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_consent is distinct from true or p_version is null or p_version not in ('matching-v1-draft','matching-v2-draft')
    or p_locale is null or p_locale not in ('en','fr','es') then
    raise exception 'matching consent required' using errcode='22023';
  end if;
end $$;
revoke all on function private.has_matching_consent(uuid),private.validate_matching_consent(boolean,text,text),
  private.record_matching_consent(uuid,uuid,text,text) from public,anon,authenticated,service_role;

commit;
