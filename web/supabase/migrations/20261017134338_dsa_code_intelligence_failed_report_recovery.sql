-- Recover legacy terminal reports after removal of the attempt-count ceiling.
-- No judge facts, source, completed report, certificate or fixture is changed.
-- A failed report remains bound to the same submission and versioned analysis.
create or replace function public.dsa_retry_code_intelligence(
  p_user_id uuid, p_submission_id uuid
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_report_id uuid;
  v_status text;
begin
  select r.id, r.status into v_report_id, v_status
    from dsa_execution_private.jobs j
    join dsa_reports_private.submissions s on s.submission_id = j.id
    join dsa_reports_private.reports r on r.id = s.report_id
    where j.id = p_submission_id
      and j.user_id = p_user_id
      and j.request->>'mode' = 'submit'
      and r.user_id = j.user_id
    for update of r;

  if not found then return 'not_found'; end if;
  if v_status = 'failed' then
    update dsa_reports_private.reports set
      status = 'queued',
      error = null,
      worker_token = null,
      worker_until = null,
      next_dispatch_at = now(),
      available_at = now(),
      updated_at = now()
    where id = v_report_id and status = 'failed' and document is null;
    if found then return 'queued'; end if;
  end if;
  return v_status;
end $$;
revoke all on function public.dsa_retry_code_intelligence(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dsa_retry_code_intelligence(uuid, uuid) to service_role;

-- Repair reports stranded by the retired attempt-limit mechanism. Do not reset
-- their attempt history. Dispatch only occurs via the existing authenticated
-- API / durable queue, preserving worker leasing and idempotency.
update dsa_reports_private.reports
set status = 'queued',
    error = null,
    worker_token = null,
    worker_until = null,
    next_dispatch_at = now(),
    available_at = now(),
    updated_at = now()
where status = 'failed'
  and error = 'Report generation exhausted its configured attempts.'
  and document is null
  and (worker_until is null or worker_until <= now());
