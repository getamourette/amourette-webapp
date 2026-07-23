-- Optional global email subscription collected after the user has spent time
-- in the live room. The address already lives in profile_private; these fields
-- record the affirmative consent separately from the contact itself.

alter table public.profile_private
  add column if not exists email_marketing_consent_at timestamptz,
  add column if not exists email_marketing_consent_version text;

comment on column public.profile_private.email_marketing_consent_at is
  'When the owner opted in to global Amourette live-night announcement emails.';

comment on column public.profile_private.email_marketing_consent_version is
  'Version of the marketing consent copy accepted by the owner.';

