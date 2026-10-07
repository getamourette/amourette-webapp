-- Uses the existing pg_cron/pg_net/Vault infrastructure. Inert until founder-
-- authorized configuration supplies both secrets; no shared values in git.
create function private.dispatch_launch_worker() returns bigint
language plpgsql security definer set search_path = '' as $$
declare worker_url text; worker_secret text; preview_bypass text; request_id bigint;
begin
 select decrypted_secret into worker_url from vault.decrypted_secrets where name='launch_worker_url' limit 1;
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='launch_worker_secret' limit 1;
 select decrypted_secret into preview_bypass from vault.decrypted_secrets where name='launch_worker_bypass' limit 1;
 if worker_url is null or worker_secret is null then return null; end if;
 if worker_url !~ '^https://[^/]+/api/launch/process$' or worker_secret !~ '^[a-f0-9]{64}$' then
   raise exception 'invalid launch worker configuration';
 end if;
 select net.http_post(url:=worker_url,
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret)||
     case when preview_bypass is null then '{}'::jsonb else jsonb_build_object('x-vercel-protection-bypass',preview_bypass) end,
   body:='{"limit":5}'::jsonb,timeout_milliseconds:=55000) into request_id;
 return request_id;
end $$;
revoke all on function private.dispatch_launch_worker() from public,anon,authenticated,service_role;
select cron.schedule('amourette-launch-payments','* * * * *',$$select private.dispatch_launch_worker();$$);
