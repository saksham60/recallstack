-- The rollout cutoff governs discovery of new work, never recovery of reports
-- already admitted to the durable outbox. No rows, quotas or judge facts change.
do $migration$
declare
  definition text := pg_get_functiondef('public.dsa_report_command(text,jsonb)'::regprocedure);
  due_filter text := $old$        and (p_args->>'createdAfter' is null or exists(select 1 from dsa_execution_private.jobs eligible where eligible.id=reports.source_submission_id and eligible.created_at >= (p_args->>'createdAfter')::timestamptz))$old$;
  claim_filter text := $old$    if p_args->>'createdAfter' is not null and not exists(select 1 from dsa_execution_private.jobs eligible where eligible.id=r.source_submission_id and eligible.created_at >= (p_args->>'createdAfter')::timestamptz) then return '"done"'::jsonb; end if;$old$;
  old_backoff text := $old$next_dispatch_at=now()+interval '30 seconds',available_at=now()+interval '30 seconds'$old$;
  new_backoff text := $new$next_dispatch_at=now()+make_interval(secs=>least(300,greatest(30,coalesce((p_args->>'retryAfterSeconds')::integer,30)))),available_at=now()+make_interval(secs=>least(300,greatest(30,coalesce((p_args->>'retryAfterSeconds')::integer,30))))$new$;
begin
  if strpos(definition,due_filter)=0 or strpos(definition,claim_filter)=0 or strpos(definition,old_backoff)=0 then
    raise exception 'Unexpected report command definition; review recovery migration before applying';
  end if;
  definition := replace(definition,due_filter,'');
  definition := replace(definition,claim_filter,'');
  definition := replace(definition,old_backoff,new_backoff);
  execute definition;
end $migration$;
