-- Retire the Code Intelligence per-report retry ceiling, including its historical
-- 2-attempt limits and 30-attempt public projection guard. Preserve worker leases,
-- queue scheduling, per-account generation quota and concurrent-claim fencing.
-- Repair the installed RPC in place so later live grading-level/createdAfter
-- extensions are not replaced by the original 2026-10-16 migration definition.
do $remove_report_limit$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.dsa_report_command(text,jsonb)'::regprocedure);
  if strpos(v_definition, $report_old_0$source_submission_id,status,error,max_attempts)$report_old_0$) = 0 then
    raise exception 'REPORT_LIMIT_MIGRATION_DRIFT_0';
  end if;
  v_definition := replace(v_definition, $report_old_0$source_submission_id,status,error,max_attempts)$report_old_0$, $report_new_0$source_submission_id,status,error)$report_new_0$);
  if strpos(v_definition, $report_old_1$case when v_limited then 'Daily Code Intelligence limit reached. The judge result is saved.' else null end,
          coalesce((p_args->>'maxAttempts')::integer,2))$report_old_1$) = 0 then
    raise exception 'REPORT_LIMIT_MIGRATION_DRIFT_1';
  end if;
  v_definition := replace(v_definition, $report_old_1$case when v_limited then 'Daily Code Intelligence limit reached. The judge result is saved.' else null end,
          coalesce((p_args->>'maxAttempts')::integer,2))$report_old_1$, $report_new_1$case when v_limited then 'Daily Code Intelligence limit reached. The judge result is saved.' else null end)$report_new_1$);
  if strpos(v_definition, $report_old_2$-- Reclaim stale workers only after the bounded provider timeout has expired.
    update dsa_reports_private.reports set status='failed',error='Report generation exhausted its configured attempts.',updated_at=now()
      where status in ('queued','generating') and attempts>=max_attempts and coalesce(worker_until,'-infinity'::timestamptz)<now();$report_old_2$) = 0 then
    raise exception 'REPORT_LIMIT_MIGRATION_DRIFT_2';
  end if;
  v_definition := replace(v_definition, $report_old_2$-- Reclaim stale workers only after the bounded provider timeout has expired.
    update dsa_reports_private.reports set status='failed',error='Report generation exhausted its configured attempts.',updated_at=now()
      where status in ('queued','generating') and attempts>=max_attempts and coalesce(worker_until,'-infinity'::timestamptz)<now();$report_old_2$, $report_new_2$-- Expired worker leases become eligible for another claim; no retry ceiling.$report_new_2$);
  if strpos(v_definition, $report_old_3$where status in ('queued','generating') and attempts<max_attempts
        and next_dispatch_at$report_old_3$) = 0 then
    raise exception 'REPORT_LIMIT_MIGRATION_DRIFT_3';
  end if;
  v_definition := replace(v_definition, $report_old_3$where status in ('queued','generating') and attempts<max_attempts
        and next_dispatch_at$report_old_3$, $report_new_3$where status in ('queued','generating')
        and next_dispatch_at$report_new_3$);
  if strpos(v_definition, $report_old_4$    if r.attempts>=r.max_attempts then
      update dsa_reports_private.reports set status='failed',worker_until=null,error='Report generation exhausted its configured attempts.',updated_at=now() where id=r.id;
      return '"done"'::jsonb;
    end if;
$report_old_4$) = 0 then
    raise exception 'REPORT_LIMIT_MIGRATION_DRIFT_4';
  end if;
  v_definition := replace(v_definition, $report_old_4$    if r.attempts>=r.max_attempts then
      update dsa_reports_private.reports set status='failed',worker_until=null,error='Report generation exhausted its configured attempts.',updated_at=now() where id=r.id;
      return '"done"'::jsonb;
    end if;
$report_old_4$, $report_new_4$$report_new_4$);
  if strpos(v_definition, $report_old_5$when coalesce((p_args->>'retry')::boolean,false) and attempts<max_attempts then 'queued'$report_old_5$) = 0 then
    raise exception 'REPORT_LIMIT_MIGRATION_DRIFT_5';
  end if;
  v_definition := replace(v_definition, $report_old_5$when coalesce((p_args->>'retry')::boolean,false) and attempts<max_attempts then 'queued'$report_old_5$, $report_new_5$when coalesce((p_args->>'retry')::boolean,false) then 'queued'$report_new_5$);
  if strpos(v_definition,'max_attempts') > 0 or strpos(v_definition,'maxAttempts') > 0 then
    raise exception 'REPORT_LIMIT_MIGRATION_LEFTOVER_REFERENCE';
  end if;
  execute v_definition;
end
$remove_report_limit$;

alter table dsa_reports_private.reports
  drop constraint reports_attempts_check;
alter table dsa_reports_private.reports
  add constraint reports_attempts_check check (attempts >= 0);
alter table dsa_reports_private.attempts
  drop constraint attempts_attempt_check;
alter table dsa_reports_private.attempts
  add constraint attempts_attempt_check check (attempt >= 1);
alter table public.dsa_code_intelligence_reports
  drop constraint dsa_code_intelligence_reports_generation_attempts_check;
alter table public.dsa_code_intelligence_reports
  add constraint dsa_code_intelligence_reports_generation_attempts_check
  check (generation_attempts >= 0);
alter table dsa_reports_private.reports
  drop column max_attempts;

-- Previously failed reports stay terminal; recovery is an explicit operator action.
