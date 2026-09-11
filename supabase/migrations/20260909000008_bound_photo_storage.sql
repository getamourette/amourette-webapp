-- #77: reinforce the service upload contract without changing #194's privacy/RLS.
-- Content decoding belongs to the authenticated uploader, not MIME metadata alone.
update storage.buckets
set file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp']
where id='profile-photos';
