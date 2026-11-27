-- #335: the retention job kept every run that never started. Such a row has
-- neither start_time nor end_time, so coalesce(end_time, start_time) was NULL
-- and the row was never deleted. Its age is still known from runid, which
-- pg_cron draws from a sequence when it inserts the row: a run inserted before
-- a run that started more than 7 days ago is itself more than 7 days old.
-- A recent run that has not started yet, or is still running, is kept.
-- Same name, so cron.schedule replaces the job created in 20261021000002.
select cron.schedule('amourette-cron-history-retention', '41 3 * * *',
  $$delete from cron.job_run_details
    where coalesce(end_time, start_time) < now() - interval '7 days'
       or (start_time is null and end_time is null
           and runid < (select max(runid) from cron.job_run_details
                        where start_time < now() - interval '7 days'))$$);
