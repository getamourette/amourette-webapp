-- #246: larger originals use private staging without recompression.
-- Apply only with founder approval. Source/final/round output buckets retain
-- their existing 50 MiB bounds; policies and grants are unchanged.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'profile-photo-staging' and public = false) then
    raise exception 'private photo staging must exist before raising its source limit';
  end if;
  update storage.buckets set file_size_limit = 20971520
    where id = 'profile-photo-staging';
end;
$$;
