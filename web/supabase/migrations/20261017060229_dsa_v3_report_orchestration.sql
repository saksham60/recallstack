-- PROPOSED: separate Supabase owner must review/apply. No certificate changes.
-- Separate reconciliation discovers committed judge results; AI cannot block finalization.
-- Installed public.dsa_code_intelligence_reports remains the canonical learner report projection.
create schema dsa_reports_private;
revoke all on schema dsa_reports_private from public, anon, authenticated;
grant usage on schema dsa_reports_private to service_role;

create table dsa_reports_private.events (
  submission_id uuid primary key references dsa_execution_private.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index dsa_report_events_pending on dsa_reports_private.events(created_at,submission_id)
where processed_at is null;

create table dsa_reports_private.reports (
  id uuid primary key references public.dsa_code_intelligence_reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  problem_version_id uuid not null references public.dsa_problem_versions(id),
  code_sha256 text not null check(code_sha256 ~ '^[a-f0-9]{64}$'),
  verdict text not null,
  grading_level text not null default 'official' check(grading_level in ('official','provisional')),
  model text not null check(length(model) between 1 and 200),
  rubric text not null check(length(rubric) between 1 and 100),
  source_submission_id uuid not null references dsa_execution_private.jobs(id) on delete cascade,
  status text not null default 'queued' check(status in ('queued','generating','completed','failed','rate_limited')),
  attempts integer not null default 0 check(attempts between 0 and 2),
  max_attempts integer not null default 2 check(max_attempts between 1 and 2),
  worker_token uuid,
  worker_until timestamptz,
  next_dispatch_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  dispatch_generation integer not null default 0,
  document jsonb check(document is null or (jsonb_typeof(document)='object' and octet_length(document::text)<=32768)),
  usage jsonb check(usage is null or (jsonb_typeof(usage)='object' and octet_length(usage::text)<=2048)),
  error text check(length(error)<=500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,problem_version_id,code_sha256,verdict,grading_level,model,rubric)
);
create index dsa_reports_user_created on dsa_reports_private.reports(user_id,created_at desc);
create index dsa_reports_dispatch on dsa_reports_private.reports(next_dispatch_at)
where status in ('queued','generating');
create table dsa_reports_private.submissions (
  submission_id uuid primary key references dsa_execution_private.jobs(id) on delete cascade,
  report_id uuid not null references dsa_reports_private.reports(id) on delete cascade
);
create table dsa_reports_private.attempts (
  report_id uuid not null references dsa_reports_private.reports(id) on delete cascade,
  attempt integer not null check(attempt between 1 and 2),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  usage jsonb,
  error text,
  primary key(report_id,attempt)
);
alter table dsa_reports_private.events enable row level security;
alter table dsa_reports_private.reports enable row level security;
alter table dsa_reports_private.submissions enable row level security;
alter table dsa_reports_private.attempts enable row level security;
grant select,insert,update,delete on all tables in schema dsa_reports_private to service_role;

-- Disable the old unfenced worker entry points before deploying the new consumer.
-- Preserve their definitions and existing records for an explicit rollback.
revoke execute on function public.dsa_code_intelligence_enqueue(integer) from service_role;
revoke execute on function public.dsa_code_intelligence_claim(integer) from service_role;
create function dsa_reports_private.project_report() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 update public.dsa_code_intelligence_reports set
   generation_status=case when new.status='rate_limited' then 'skipped' else new.status end,
   model_id=new.model,rubric_version=new.rubric,prompt_version='dsa-code-intelligence:1',
   assessment=new.document,generation_attempts=new.attempts,
   generation_started_at=case when new.status='generating' then now() else generation_started_at end,
   generation_completed_at=case when new.status='completed' then now() else generation_completed_at end,
   error_code=case when new.error is null then null else 'V3_REPORT_UNAVAILABLE' end
 where id=new.id;
 if not found then raise exception 'REPORT_PROJECTION_MISSING'; end if;
 return new;
end $$;
create trigger dsa_v3_report_projection after insert or update on dsa_reports_private.reports
 for each row execute function dsa_reports_private.project_report();

create function dsa_reports_private.report_view(r dsa_reports_private.reports) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',r.id,'status',r.status,'model',r.model,'rubric',r.rubric,
    'createdAt',r.created_at,'updatedAt',r.updated_at,'attempts',r.attempts)
    || case when r.document is null then '{}'::jsonb else jsonb_build_object('analysis',r.document) end
    || case when r.error is null then '{}'::jsonb else jsonb_build_object('error',r.error) end;
$$;

-- Only the trusted server may call this RPC. userId always comes from verified auth.
create function public.dsa_report_command(p_action text,p_args jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  e record; j dsa_execution_private.jobs%rowtype; r dsa_reports_private.reports%rowtype;
  v_id uuid; v_source_id uuid; v_report_version integer; v_limited boolean; v_items jsonb; v_rows jsonb; v_scope uuid[];
begin
  if p_args ? 'submissionIds' then
    if jsonb_typeof(p_args->'submissionIds')<>'array' then
      return jsonb_build_object('code','INVALID_CONFIGURATION');
    end if;
    if jsonb_array_length(p_args->'submissionIds') not between 1 and 10 then
      return jsonb_build_object('code','INVALID_CONFIGURATION');
    end if;
    select array_agg(value::uuid) into v_scope from jsonb_array_elements_text(p_args->'submissionIds');
  end if;
  if p_action='history' then
    select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]') into v_rows from (
      select dsa_execution_private.job_view(history_job) as item,history_job.created_at,history_job.id
      from dsa_execution_private.jobs history_job where history_job.user_id=(p_args->>'userId')::uuid
        and history_job.request->>'mode'='submit' and history_job.request->>'problemId'=p_args->>'problemId'
        and history_job.request->>'problemVersionId'=p_args->>'problemVersionId'
        and (p_args->>'before' is null or (history_job.created_at,history_job.id)<((p_args->>'before')::timestamptz,(p_args->>'beforeId')::uuid))
      order by history_job.created_at desc,history_job.id desc limit 21
    ) x;
    return jsonb_build_object('items',v_rows);
  elsif p_action='get' then
    select * into j from dsa_execution_private.jobs where id=(p_args->>'submissionId')::uuid
      and user_id=(p_args->>'userId')::uuid and request->>'mode'='submit';
    if not found then return null; end if;
    select a.* into r from dsa_reports_private.submissions s join dsa_reports_private.reports a on a.id=s.report_id
      where s.submission_id=j.id and a.user_id=j.user_id;
    return jsonb_build_object('submissionId',j.id,'sourceCode',j.request->>'code',
      'codeSha256',encode(sha256(convert_to(j.request->>'code','UTF8')),'hex'),
      'report',case when r.id is null then null else dsa_reports_private.report_view(r) end);
  elsif p_action='regenerate' then
    -- Operator only. No browser endpoint exposes deliberate model/rubric changes.
    perform 1 from dsa_execution_private.jobs where id=(p_args->>'submissionId')::uuid
      and request->>'mode'='submit' and status in ('completed','timed_out') and result is not null;
    if not found then return false::text::jsonb; end if;
    delete from dsa_reports_private.submissions where submission_id=(p_args->>'submissionId')::uuid;
    insert into dsa_reports_private.events(submission_id) values((p_args->>'submissionId')::uuid)
      on conflict(submission_id) do update set processed_at=null;
    return true::text::jsonb;
  elsif p_action='dispatch' then
    if coalesce(length(p_args->>'model'),0) not between 1 and 200 or coalesce(length(p_args->>'rubric'),0) not between 1 and 100 then
      return jsonb_build_object('code','INVALID_CONFIGURATION');
    end if;
    perform pg_advisory_xact_lock(20161016,2);
    -- Reconcile separately from judge transactions; interrupted dispatch is retryable.
    insert into dsa_reports_private.events(submission_id,created_at)
    select id,created_at from dsa_execution_private.jobs where request->>'mode'='submit'
      and status in ('completed','timed_out') and result->>'verdict' in
        ('accepted','provisional_pass','wrong_answer','syntax_error','runtime_error','time_limit_exceeded','output_limit_exceeded')
      and (v_scope is null or id=any(v_scope)) on conflict do nothing;
    for e in select submission_id from dsa_reports_private.events where processed_at is null
      and (v_scope is null or submission_id=any(v_scope))
      order by created_at,submission_id limit 25 for update skip locked loop
      select * into j from dsa_execution_private.jobs where id=e.submission_id;
      v_id:=null;
      select id into v_id from dsa_reports_private.reports where user_id=j.user_id
        and problem_version_id=(j.request->>'problemVersionId')::uuid
        and code_sha256=encode(sha256(convert_to(j.request->>'code','UTF8')),'hex')
        and verdict=j.result->>'verdict' and grading_level=coalesce(j.plan->>'gradingLevel','official')
        and model=p_args->>'model' and rubric=p_args->>'rubric';
      if v_id is null then
        select count(*)>=10 into v_limited from dsa_reports_private.reports where user_id=j.user_id
          and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and status<>'rate_limited';
        -- Adopt an existing ungenerated row when its model/rubric is compatible.
        -- Completed historical versions are retained; a new rubric gets a new version.
        select canonical.id,canonical.submission_id into v_id,v_source_id
          from public.dsa_code_intelligence_reports canonical
          where canonical.user_id=j.user_id
          and canonical.problem_version_id=(j.request->>'problemVersionId')::uuid
          and canonical.code_sha256=encode(sha256(convert_to(j.request->>'code','UTF8')),'hex')
          and canonical.verified_verdict=j.result->>'verdict'
          and coalesce((select old_job.plan->>'gradingLevel' from dsa_execution_private.jobs old_job where old_job.id=canonical.submission_id),'official')=coalesce(j.plan->>'gradingLevel','official')
          and canonical.generation_status='queued' and canonical.assessment is null
          and (canonical.model_id is null or canonical.model_id=p_args->>'model')
          and (canonical.rubric_version is null or canonical.rubric_version=p_args->>'rubric')
          order by canonical.created_at,canonical.id limit 1;
        if v_id is null then
          v_source_id:=j.id;
          select coalesce(max(report_version),0)+1 into v_report_version
            from public.dsa_code_intelligence_reports where submission_id=j.id;
          insert into public.dsa_code_intelligence_reports(submission_id,report_version)
            values(j.id,v_report_version) returning id into v_id;
        end if;
        insert into dsa_reports_private.reports(id,user_id,problem_version_id,code_sha256,verdict,grading_level,model,rubric,source_submission_id,status,error,max_attempts)
        values(v_id,j.user_id,(j.request->>'problemVersionId')::uuid,encode(sha256(convert_to(j.request->>'code','UTF8')),'hex'),j.result->>'verdict',
          coalesce(j.plan->>'gradingLevel','official'),p_args->>'model',p_args->>'rubric',v_source_id,case when v_limited then 'rate_limited' else 'queued' end,
          case when v_limited then 'Daily Code Intelligence limit reached. The judge result is saved.' else null end,
          coalesce((p_args->>'maxAttempts')::integer,2)) returning id into v_id;
      end if;
      insert into dsa_reports_private.submissions(submission_id,report_id) values(j.id,v_id) on conflict do nothing;
      update dsa_reports_private.events set processed_at=now() where submission_id=j.id;
    end loop;
    -- Reclaim stale workers only after the bounded provider timeout has expired.
    update dsa_reports_private.reports set status='failed',error='Report generation exhausted its configured attempts.',updated_at=now()
      where status in ('queued','generating') and attempts>=max_attempts and coalesce(worker_until,'-infinity'::timestamptz)<now();
    with due as (
      select id from dsa_reports_private.reports where status in ('queued','generating') and attempts<max_attempts
        and next_dispatch_at<=now() and available_at<=now() and coalesce(worker_until,'-infinity'::timestamptz)<now()
        and (v_scope is null or exists(select 1 from dsa_reports_private.submissions s
          where s.report_id=reports.id and s.submission_id=any(v_scope)))
      order by next_dispatch_at,id limit 10 for update skip locked
    ), reserved as (
      update dsa_reports_private.reports a set next_dispatch_at=now()+interval '1 minute',dispatch_generation=dispatch_generation+1
      from due where a.id=due.id returning a.id,a.dispatch_generation
    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'generation',dispatch_generation)),'[]') into v_rows from reserved;
    return v_rows;
  elsif p_action='claim' then
    perform pg_advisory_xact_lock(20161016,2);
    select * into r from dsa_reports_private.reports where id=(p_args->>'id')::uuid for update;
    if not found or r.status in ('completed','failed','rate_limited') then return '"done"'::jsonb; end if;
    if v_scope is not null and not exists(select 1 from dsa_reports_private.submissions s
      where s.report_id=r.id and s.submission_id=any(v_scope)) then return '"done"'::jsonb; end if;
    if r.worker_until>now() or r.available_at>now() then return null; end if;
    if r.attempts>=r.max_attempts then
      update dsa_reports_private.reports set status='failed',worker_until=null,error='Report generation exhausted its configured attempts.',updated_at=now() where id=r.id;
      return '"done"'::jsonb;
    end if;
    if (select count(*) from dsa_reports_private.reports where status='generating' and worker_until>now())>=2 then return null; end if;
    update dsa_reports_private.reports set status='generating',attempts=attempts+1,worker_token=(p_args->>'token')::uuid,
      worker_until=now()+interval '90 seconds',updated_at=now() where id=r.id returning * into r;
    update dsa_reports_private.attempts set finished_at=now(),error='Worker lease expired; provider outcome was not confirmed.'
      where report_id=r.id and finished_at is null;
    insert into dsa_reports_private.attempts(report_id,attempt) values(r.id,r.attempts);
    select * into j from dsa_execution_private.jobs where id=r.source_submission_id;
    select coalesce(jsonb_agg(x.item),'[]') into v_items from (
      select jsonb_build_object('submissionId',id,'verdict',result->>'verdict','createdAt',created_at) item
      from dsa_execution_private.jobs where user_id=j.user_id and request->>'problemVersionId'=j.request->>'problemVersionId'
        and request->>'mode'='submit' and created_at<j.created_at and result is not null order by created_at desc limit 3
    ) x;
    -- Deliberately no plan, oracle, private test, stdout, stderr or expected value.
    return jsonb_build_object('id',r.id,'token',r.worker_token,'model',r.model,'rubric',r.rubric,'attempt',r.attempts,
      'packet',jsonb_build_object('submissionId',j.id,'problemId',j.request->>'problemId','problemVersionId',j.request->>'problemVersionId',
        'code',j.request->>'code','judge',jsonb_strip_nulls(jsonb_build_object('verdict',j.result->>'verdict',
          'gradingLevel',coalesce(j.plan->>'gradingLevel','official'),
          'passedTests',j.result->'passedTests','totalTests',j.result->'totalTests','executionTimeMs',j.result->'executionTimeMs','memoryKiB',j.result->'memoryKiB')),
        'earlierAttempts',v_items,'statement',(select jsonb_build_object('title',left(v.specification->>'title',300),
          'description',left(v.specification->>'problem_statement',6000)) from public.dsa_problem_versions v where v.id=r.problem_version_id)));
  elsif p_action='finish' then
    update dsa_reports_private.reports set
      status=case when p_args->'document' is not null and p_args->'document'<>'null'::jsonb then 'completed'
        when coalesce((p_args->>'retry')::boolean,false) and attempts<max_attempts then 'queued' else 'failed' end,
      document=nullif(p_args->'document','null'::jsonb),usage=nullif(p_args->'usage','null'::jsonb),error=left(p_args->>'error',500),
      worker_until=null,worker_token=null,next_dispatch_at=now()+interval '30 seconds',available_at=now()+interval '30 seconds',updated_at=now()
    where id=(p_args->>'id')::uuid and worker_token=(p_args->>'token')::uuid and worker_until>now() and status='generating';
    if not found then return 'false'::jsonb; end if;
    update dsa_reports_private.attempts set finished_at=now(),usage=nullif(p_args->'usage','null'::jsonb),error=left(p_args->>'error',500)
      where report_id=(p_args->>'id')::uuid and finished_at is null;
    return 'true'::jsonb;
  end if;
  return jsonb_build_object('code','UNKNOWN_ACTION');
end $$;
revoke all on function public.dsa_report_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.dsa_report_command(text,jsonb) to service_role;
revoke all on all functions in schema dsa_reports_private from public,anon,authenticated;
grant execute on all functions in schema dsa_reports_private to service_role;

-- Seed event identities only; subsequent reconciliation discovers newer terminal jobs.
-- No judge trigger, AI call or verdict mutation is installed.
insert into dsa_reports_private.events(submission_id)
select id from dsa_execution_private.jobs where request->>'mode'='submit'
  and status in ('completed','timed_out') and result->>'verdict' in
    ('accepted','provisional_pass','wrong_answer','syntax_error','runtime_error','time_limit_exceeded','output_limit_exceeded') on conflict do nothing;
