-- Additive, server-only execution persistence. Review before production application.
-- No existing specification, fixture, publication or learner row is changed.
create schema if not exists dsa_execution_private;
revoke all on schema dsa_execution_private from public, anon, authenticated;
grant usage on schema dsa_execution_private to service_role;

create table dsa_execution_private.certificates (
  id uuid primary key default gen_random_uuid(),
  problem_version_id uuid not null references public.dsa_problem_versions(id),
  suite_id uuid not null unique references public.dsa_test_suites(id),
  contract jsonb not null check (jsonb_typeof(contract) = 'object'),
  public_run_approved boolean not null default false,
  hidden_submit_approved boolean not null default false,
  expose_counts boolean not null default false,
  certified_by uuid not null references public.profiles(id),
  certified_at timestamptz not null,
  revoked_at timestamptz
);
create index dsa_execution_certificates_version_idx on dsa_execution_private.certificates(problem_version_id);
alter table dsa_execution_private.certificates enable row level security;

create table dsa_execution_private.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','timed_out','cancelled')),
  phase text not null default 'prepared' check (phase in ('prepared','launching','launched')),
  slot integer unique check (slot between 1 and 5),
  worker_token uuid,
  worker_until timestamptz,
  operation_id uuid unique,
  launched_at timestamptz,
  cancel_requested boolean not null default false,
  attempts integer not null default 0,
  dispatch_generation integer not null default 0,
  next_dispatch_at timestamptz not null default now(),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (octet_length(request::text) <= 131072),
  check (octet_length(plan::text) <= 1048576),
  check (result is null or octet_length(result::text) <= 524288)
);
create index dsa_execution_jobs_user_created_idx on dsa_execution_private.jobs(user_id, created_at desc);
create index dsa_execution_jobs_dispatch_idx on dsa_execution_private.jobs(next_dispatch_at)
where status in ('queued','running') or slot is not null;
alter table dsa_execution_private.jobs enable row level security;
grant select, insert, update, delete on all tables in schema dsa_execution_private to service_role;
grant select on public.dsa_problem_versions, public.dsa_problem_definitions,
  public.dsa_test_suites, public.dsa_test_cases, public.content_items,
  public.content_versions, public.domains to service_role;

-- An execution certificate is independent from statement publication. Only the
-- latest published suite qualifies. No fallbacks to drafts, examples or old suites.
create function dsa_execution_private.evaluation_plan(p_problem uuid, p_version uuid, p_mode text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_suite uuid; v_certificate dsa_execution_private.certificates%rowtype; v_cases jsonb; v_count integer;
begin
  if p_mode not in ('run','submit') then return null; end if;
  perform 1 from public.content_items i
  join public.domains d on d.id=i.domain_id and d.slug='dsa' and d.is_active
  join public.content_versions b on b.id=i.current_published_version_id and b.content_item_id=i.id
  join public.dsa_problem_definitions def on def.content_item_id=i.id
  join public.dsa_problem_versions v on v.id=def.current_version_id and v.definition_id=def.id
  where i.id=p_problem and v.id=p_version and i.type::text='problem' and i.archived_at is null
    and b.status::text='published' and b.published_at is not null and v.status='published'
    and v.provenance #> '{quality_review_20261015,publish_approved}' = 'true'::jsonb
    and v.specification->'supported_languages' @> '["python"]'::jsonb;
  if not found then return null; end if;
  select s.id into v_suite from public.dsa_test_suites s where s.problem_version_id=p_version
    order by s.suite_version desc, s.created_at desc, s.id desc limit 1;
  if not exists(select 1 from public.dsa_test_suites s where s.id=v_suite and s.status='published') then return null; end if;
  select * into v_certificate from dsa_execution_private.certificates c
    where c.suite_id=v_suite and c.problem_version_id=p_version and c.revoked_at is null
      and (case when p_mode='run' then c.public_run_approved else c.hidden_submit_approved end);
  if not found then return null; end if;
  if not exists(select 1 from public.dsa_test_suites s where s.id=v_suite and
    s.checker_type=case v_certificate.contract->>'checker' when 'exact_json' then 'exact' when 'unordered_json' then 'unordered' when 'numeric' then 'numeric_tolerance' else '' end) then return null; end if;
  if p_mode='submit' and (
    not exists(select 1 from public.dsa_test_cases t where t.suite_id=v_suite and t.visibility='hidden')
    or exists(select 1 from public.dsa_test_cases t where t.suite_id=v_suite and
      (t.validation_status <> 'verified' or t.input_json is null or t.fixture_ref is not null))
  ) then return null; end if;
  select count(*), jsonb_agg(jsonb_build_object('id',t.id,'input',t.input_json,'expected',t.expected_json,'visibility',t.visibility) order by t.ordinal,t.id)
    into v_count,v_cases from public.dsa_test_cases t where t.suite_id=v_suite
      and t.validation_status='verified' and t.input_json is not null and t.fixture_ref is null
      and (p_mode='submit' or t.visibility='public');
  if v_count=0 or v_count > (case when p_mode='run' then 20 else 100 end) then return null; end if;
  return jsonb_build_object('certificateId',v_certificate.id,'suiteId',v_suite,'problemId',p_problem,
    'problemVersionId',p_version,'contract',v_certificate.contract,'exposeCounts',v_certificate.expose_counts,'cases',v_cases);
end $$;

create function dsa_execution_private.job_view(j dsa_execution_private.jobs)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('submissionId',j.id,'problemId',j.request->>'problemId',
    'problemVersionId',j.request->>'problemVersionId','language',j.request->>'language','mode',j.request->>'mode',
    'status',j.status,'createdAt',j.created_at,'updatedAt',j.updated_at)
    || case when j.result is null then '{}'::jsonb else jsonb_build_object('result',j.result) end
    || case when j.error is null then '{}'::jsonb else jsonb_build_object('error',j.error) end;
$$;

-- One service-role RPC serializes admissions/claims and fences every worker write.
-- The caller is the authenticated Next.js API or verified Queue consumer, never a browser.
create function public.dsa_execution_command(p_action text, p_args jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j dsa_execution_private.jobs%rowtype; v_plan jsonb; v_slot integer; v_now timestamptz:=clock_timestamp(); v_result jsonb; v_id uuid;
begin
  if p_action='availability' then
    return jsonb_build_object('run',dsa_execution_private.evaluation_plan((p_args->>'problemId')::uuid,(p_args->>'problemVersionId')::uuid,'run'),
      'submit',dsa_execution_private.evaluation_plan((p_args->>'problemId')::uuid,(p_args->>'problemVersionId')::uuid,'submit'));
  elsif p_action='create' then
    perform pg_advisory_xact_lock(hashtextextended('dsa_execution_admission',0));
    select * into j from dsa_execution_private.jobs where user_id=(p_args->>'userId')::uuid and idempotency_key=(p_args->'request'->>'idempotencyKey')::uuid;
    if found then
      if j.request_hash <> p_args->>'hash' then return jsonb_build_object('code','IDEMPOTENCY_CONFLICT'); end if;
      return dsa_execution_private.job_view(j);
    end if;
    if (select count(*) from dsa_execution_private.jobs where user_id=(p_args->>'userId')::uuid and (status in ('queued','running') or slot is not null)) >= 2
      or (select count(*) from dsa_execution_private.jobs where user_id=(p_args->>'userId')::uuid and created_at>v_now-interval '24 hours') >= 100
      or (select count(*) from dsa_execution_private.jobs where status in ('queued','running') or slot is not null) >= 200 then
      return jsonb_build_object('code','ACCOUNT_LIMIT');
    end if;
    if p_args->'request'->>'language' <> 'python' or char_length(p_args->'request'->>'code') not between 1 and 24000 then
      return jsonb_build_object('code','INVALID_REQUEST');
    end if;
    v_plan := dsa_execution_private.evaluation_plan((p_args->'request'->>'problemId')::uuid,(p_args->'request'->>'problemVersionId')::uuid,p_args->'request'->>'mode');
    if v_plan is null then return jsonb_build_object('code','NOT_ELIGIBLE'); end if;
    insert into dsa_execution_private.jobs(user_id,idempotency_key,request_hash,request,plan)
      values((p_args->>'userId')::uuid,(p_args->'request'->>'idempotencyKey')::uuid,p_args->>'hash',p_args->'request',v_plan) returning * into j;
    return dsa_execution_private.job_view(j);
  elsif p_action in ('get','cancel') then
    select * into j from dsa_execution_private.jobs where id=(p_args->>'id')::uuid and user_id=(p_args->>'userId')::uuid for update;
    if not found then return null; end if;
    if p_action='cancel' and j.status in ('queued','running') then
      update dsa_execution_private.jobs set cancel_requested=true,
        status=case when phase='prepared' and worker_token is null then 'cancelled' else status end,
        next_dispatch_at=v_now, updated_at=v_now where id=j.id returning * into j;
    end if;
    return dsa_execution_private.job_view(j);
  elsif p_action='dispatch' then
    with due as (select id from dsa_execution_private.jobs where next_dispatch_at<=v_now
      and (status='queued' or (status='running' and coalesce(worker_until,v_now)<=v_now) or (slot is not null and status not in ('queued','running') and coalesce(worker_until,v_now)<=v_now))
      order by next_dispatch_at,id for update skip locked limit 25),
    changed as (update dsa_execution_private.jobs x set dispatch_generation=x.dispatch_generation+1,next_dispatch_at=v_now+interval '60 seconds'
      from due where x.id=due.id returning x.id,x.dispatch_generation)
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'generation',dispatch_generation)),'[]'::jsonb) into v_result from changed;
    return v_result;
  elsif p_action='claim' then
    perform pg_advisory_xact_lock(hashtextextended('dsa_execution_capacity',0));
    select * into j from dsa_execution_private.jobs where id=(p_args->>'id')::uuid for update;
    if not found or (j.status not in ('queued','running') and j.slot is null) then return '"done"'::jsonb; end if;
    if j.worker_until>v_now then return null; end if;
    if j.slot is null then
      select s into v_slot from generate_series(1,5) s where not exists(select 1 from dsa_execution_private.jobs held where held.slot=s) order by s limit 1;
      if v_slot is null then return null; end if;
    else v_slot:=j.slot; end if;
    update dsa_execution_private.jobs set slot=v_slot, worker_token=(p_args->>'token')::uuid,worker_until=v_now+interval '90 seconds',
      status=case when status='queued' then 'running' else status end,attempts=attempts+1,updated_at=v_now where id=j.id returning * into j;
    return jsonb_strip_nulls(jsonb_build_object('id',j.id,'token',j.worker_token,'request',j.request,'phase',j.phase,'operationId',j.operation_id,
      'launchedAt',j.launched_at,'createdAt',j.created_at,'cancelRequested',j.cancel_requested,'attempts',j.attempts,'cleanupOnly',j.status not in ('queued','running')));
  end if;
  -- Worker actions below require an unexpired fencing token, even after redelivery.
  select * into j from dsa_execution_private.jobs where id=(p_args->>'id')::uuid
    and worker_token=(p_args->>'token')::uuid and worker_until>v_now for update;
  if not found then return jsonb_build_object('code','LEASE_LOST'); end if;
  if p_action='plan' then
    v_plan:=dsa_execution_private.evaluation_plan((j.request->>'problemId')::uuid,(j.request->>'problemVersionId')::uuid,j.request->>'mode');
    if v_plan is null or v_plan<>j.plan then return jsonb_build_object('code','NOT_ELIGIBLE'); end if;
    return v_plan;
  elsif p_action='launch' then
    if j.phase<>'prepared' or j.cancel_requested or j.status<>'running' then return 'false'::jsonb; end if;
    update dsa_execution_private.jobs set phase='launching',launched_at=v_now,updated_at=v_now where id=j.id;
    return 'true'::jsonb;
  elsif p_action='operation' then
    if j.operation_id is not null and j.operation_id<>(p_args->>'operationId')::uuid then return jsonb_build_object('code','OPERATION_CONFLICT'); end if;
    update dsa_execution_private.jobs set operation_id=(p_args->>'operationId')::uuid,phase='launched',updated_at=v_now where id=j.id;
    return 'true'::jsonb;
  elsif p_action='defer' then
    update dsa_execution_private.jobs set worker_until=v_now,next_dispatch_at=v_now+interval '30 seconds' where id=j.id;
    return 'true'::jsonb;
  elsif p_action='finish' then
    if p_args->>'status' not in ('completed','failed','timed_out','cancelled') then return jsonb_build_object('code','INVALID_REQUEST'); end if;
    -- Check the frozen plan in the same transaction as terminal publication.
    if p_args->>'status' in ('completed','timed_out') and j.status in ('queued','running') and not j.cancel_requested then
      v_plan:=dsa_execution_private.evaluation_plan((j.request->>'problemId')::uuid,(j.request->>'problemVersionId')::uuid,j.request->>'mode');
      if v_plan is null or v_plan<>j.plan then
        p_args:=p_args || jsonb_build_object('status','failed','result',null,'error','The certified suite is no longer eligible.');
      end if;
    end if;
    v_result:=p_args->'result';
    if v_result='null'::jsonb then v_result:=null; end if;
    if j.request->>'mode'='submit' and v_result is not null then
      -- Defense in depth: hidden case outputs/logs can never enter the public DTO.
      v_result:=jsonb_strip_nulls(jsonb_build_object('verdict',v_result->'verdict','wallTimeMs',v_result->'wallTimeMs',
        'executionTimeMs',v_result->'executionTimeMs','memoryKiB',v_result->'memoryKiB',
        'passedTests',case when (j.plan->>'exposeCounts')::boolean then v_result->'passedTests' end,
        'totalTests',case when (j.plan->>'exposeCounts')::boolean then v_result->'totalTests' end));
    end if;
    update dsa_execution_private.jobs set
      status=case when status not in ('queued','running') then status when cancel_requested then 'cancelled' else p_args->>'status' end,
      result=case when cancel_requested or status not in ('queued','running') then null else v_result end,
      error=case when cancel_requested then null when status not in ('queued','running') then error else left(p_args->>'error',240) end,
      slot=case when coalesce((p_args->>'release')::boolean,true) then null else slot end,
      worker_until=v_now,next_dispatch_at=v_now+interval '60 seconds',updated_at=v_now where id=j.id;
    return 'true'::jsonb;
  end if;
  return jsonb_build_object('code','INVALID_REQUEST');
end $$;

revoke all on all functions in schema dsa_execution_private from public, anon, authenticated;
grant execute on all functions in schema dsa_execution_private to service_role;
revoke all on function public.dsa_execution_command(text,jsonb) from public, anon, authenticated;
grant execute on function public.dsa_execution_command(text,jsonb) to service_role;
