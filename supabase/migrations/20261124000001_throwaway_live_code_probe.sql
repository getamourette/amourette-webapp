-- Throwaway probe for the "Live code on the new schema" job (#434). Never merged.
update public.venues set slug = slug where false;
