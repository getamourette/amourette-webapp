-- #279: allow HEVC still-image inputs only in private staging. No policy/grant
-- or published/source bucket changes. Apply only with founder approval.
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'profile-photo-staging' and public = false and file_size_limit = 20971520
  ) then
    raise exception 'private 20 MiB photo staging must exist before enabling HEIC';
  end if;
  update storage.buckets
    set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    where id = 'profile-photo-staging';
end;
$$;
