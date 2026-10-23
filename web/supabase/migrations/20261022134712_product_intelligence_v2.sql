-- Additive server-only storage. Apply only after explicit rollout authorization.
begin;
create schema telemetry_private;
revoke all on schema telemetry_private from public, anon, authenticated;
grant usage on schema telemetry_private to service_role;

create table telemetry_private.installation (
  singleton boolean primary key default true check(singleton),
  installed_at timestamptz not null default now(),
  collection_started_at timestamptz,
  schema_version integer not null default 1 check(schema_version=1)
);
insert into telemetry_private.installation default values;

create table telemetry_private.product_events (
  event_id uuid primary key,
  schema_version integer not null check(schema_version=1),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  journey_id uuid,
  correlation_id uuid,
  event_name varchar(80) not null,
  feature varchar(30) not null,
  source varchar(10) not null check(source in ('web','mobile')),
  environment varchar(15) not null,
  entity_id uuid,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  effective_at timestamptz not null,
  clock_quality varchar(12) not null check(clock_quality in ('plausible','delayed','invalid')),
  engaged boolean not null,
  properties jsonb not null check(jsonb_typeof(properties)='object' and octet_length(properties::text)<=2048)
);
create index product_events_user_time on telemetry_private.product_events(user_id,effective_at desc,event_id desc);
create index product_events_feature_time on telemetry_private.product_events(feature,effective_at desc);
create index product_events_name_time on telemetry_private.product_events(event_name,effective_at desc);
create index product_events_session_time on telemetry_private.product_events(user_id,session_id,effective_at);
create index product_events_correlation on telemetry_private.product_events(correlation_id) where correlation_id is not null;
create index product_events_received on telemetry_private.product_events(received_at);

create table telemetry_private.user_sessions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  source varchar(10) not null,
  started_at timestamptz not null,
  last_received_at timestamptz not null,
  ended_at timestamptz,
  active_seconds integer not null default 0 check(active_seconds>=0),
  event_count integer not null default 0,
  app_version varchar(80),
  build_version varchar(80),
  os_family varchar(15),
  primary key(user_id,session_id)
);
create index user_sessions_received on telemetry_private.user_sessions(last_received_at);
create index user_sessions_user_time on telemetry_private.user_sessions(user_id,started_at desc);

create table telemetry_private.user_acquisition (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  source varchar(10) not null,
  properties jsonb not null check(jsonb_typeof(properties)='object' and octet_length(properties::text)<=2048)
);
-- Set by trusted server claims/admin only, never from user-editable metadata or email guesses.
create table telemetry_private.account_classifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  classification varchar(15) not null check(classification in ('internal','judge','demo','test')),
  classified_by uuid references public.profiles(id) on delete set null,
  reason varchar(80) not null,
  created_at timestamptz not null default now()
);
create table telemetry_private.ingestion_health (
  day date primary key,
  accepted bigint not null default 0,
  duplicates bigint not null default 0,
  delayed bigint not null default 0,
  invalid_clocks bigint not null default 0,
  failed bigint not null default 0,
  journal_failures bigint not null default 0,
  rejected bigint not null default 0,
  last_received_at timestamptz
);
-- Minute quotas are atomic across API workers, including duplicate retries.
create table telemetry_private.ingestion_quotas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  minute timestamptz not null,
  events integer not null,
  primary key(user_id,minute)
);
-- One metadata row per server orchestration run, no transcript or model response.
create table telemetry_private.ai_run_measurements (
  run_id uuid primary key references public.reasonai_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  received_at timestamptz not null default now(),
  status varchar(15) not null check(status in ('completed','failed','cancelled','interrupted')),
  duration_ms integer not null check(duration_ms between 0 and 3600000),
  first_output_ms integer check(first_output_ms between 0 and 3600000),
  tools jsonb not null check(jsonb_typeof(tools)='object' and octet_length(tools::text)<=4096),
  models jsonb not null check(jsonb_typeof(models)='array' and octet_length(models::text)<=512)
);
create index ai_run_measurements_user_time on telemetry_private.ai_run_measurements(user_id,received_at desc);
alter table telemetry_private.ai_run_measurements enable row level security;
-- Keep minimal interaction provenance when expired stories cascade-delete their events.
-- Explicit event/user deletion must not resurrect analytics or retain deleted content.
create table telemetry_private.deleted_story_actions (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null,
  event_type varchar(30) not null,
  occurred_at timestamptz not null
);
create index deleted_story_actions_user_time on telemetry_private.deleted_story_actions(profile_id,occurred_at desc);
alter table telemetry_private.deleted_story_actions enable row level security;
create function telemetry_private.preserve_expired_story_action() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.profiles where id=old.profile_id)
    and not exists(select 1 from public.knowledge_stories where id=old.story_id) then
    insert into telemetry_private.deleted_story_actions values
      (old.id,old.profile_id,old.story_id,old.event_type,old.occurred_at)
    on conflict(id) do nothing;
  end if;
  return old;
end $$;
revoke all on function telemetry_private.preserve_expired_story_action() from public,anon,authenticated;
create trigger telemetry_preserve_expired_story_action before delete on public.user_story_events
  for each row execute function telemetry_private.preserve_expired_story_action();
-- Future authoritative lifecycle evidence, not a fabricated historical backfill.
-- Heartbeats and unchanged worker lease updates do not create journal rows.
create table telemetry_private.dsa_job_transitions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references dsa_execution_private.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  event_name varchar(80) not null,
  problem_id uuid,
  mode varchar(10) not null,
  status varchar(15) not null,
  phase varchar(15) not null,
  attempt integer not null,
  verdict varchar(30) not null,
  official boolean not null,
  unique(job_id,status,phase,attempt,verdict)
);
create index dsa_job_transitions_user_time on telemetry_private.dsa_job_transitions(user_id,occurred_at desc,id desc);
create index dsa_job_transitions_time on telemetry_private.dsa_job_transitions(occurred_at);
alter table telemetry_private.dsa_job_transitions enable row level security;
create function telemetry_private.record_dsa_job_transition() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_verdict text; v_mode text; v_name text; v_official boolean; v_problem uuid;
begin
  if tg_op='UPDATE' then
    if (new.status,new.phase,new.attempts,new.result->>'verdict') is not distinct from
       (old.status,old.phase,old.attempts,old.result->>'verdict') then return new; end if;
  end if;
  v_mode:=new.request->>'mode';
  if v_mode not in ('run','submit') then return new; end if;
  v_verdict:=case when new.result->>'verdict' in ('accepted','provisional_pass','passed_public_tests',
    'wrong_answer','runtime_error','syntax_error','time_limit_exceeded','output_limit_exceeded')
    then new.result->>'verdict' else 'unknown' end;
  v_official:=v_mode='submit' and nullif(new.plan->>'certificateId','') is not null
    and coalesce(new.plan->>'gradingLevel','official')='official';
  if new.request->>'problemId' ~ '^[0-9a-fA-F-]{36}$' then v_problem:=(new.request->>'problemId')::uuid; end if;
  v_name:=case
    when new.status='completed' and v_official and v_verdict='accepted' then 'dsa.official_accepted'
    when new.status='completed' then 'dsa.verdict_persisted'
    when new.status in ('failed','timed_out','cancelled') then 'dsa.execution_'||new.status
    when new.phase='launched' then 'dsa.sandbox_started'
    when new.phase='launching' then 'dsa.dispatch_started'
    else 'dsa.'||v_mode||'_queued' end;
  insert into telemetry_private.dsa_job_transitions
    (job_id,user_id,event_name,problem_id,mode,status,phase,attempt,verdict,official)
  values(new.id,new.user_id,v_name,v_problem,v_mode,new.status,new.phase,least(new.attempts,100),v_verdict,coalesce(v_official,false))
  on conflict(job_id,status,phase,attempt,verdict) do nothing;
  return new;
exception when others then
  -- Optional telemetry cannot prevent the official judge from committing.
  begin
    insert into telemetry_private.ingestion_health(day,journal_failures)
      values((now() at time zone 'UTC')::date,1)
      on conflict(day) do update set journal_failures=telemetry_private.ingestion_health.journal_failures+1;
  exception when others then null;
  end;
  raise warning 'TELEMETRY_DSA_JOURNAL_WRITE_FAILED';
  return new;
end $$;
revoke all on function telemetry_private.record_dsa_job_transition() from public,anon,authenticated;
create trigger telemetry_dsa_job_transition after insert or update on dsa_execution_private.jobs
  for each row execute function telemetry_private.record_dsa_job_transition();
alter table telemetry_private.installation enable row level security;
alter table telemetry_private.product_events enable row level security;
alter table telemetry_private.user_sessions enable row level security;
alter table telemetry_private.user_acquisition enable row level security;
alter table telemetry_private.account_classifications enable row level security;
alter table telemetry_private.ingestion_health enable row level security;
alter table telemetry_private.ingestion_quotas enable row level security;
revoke all on all tables in schema telemetry_private from public, anon, authenticated;
grant select,insert,update,delete on all tables in schema telemetry_private to service_role;
-- Supabase exposes this narrowly typed RPC, never the private table/schema.
create function public.telemetry_record_ai_run(
  p_run uuid,p_user uuid,p_status text,p_duration integer,p_first_output integer,
  p_tools jsonb,p_models jsonb
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.reasonai_runs r join public.reasonai_conversations c
    on c.id=r.conversation_id where r.id=p_run and c.user_id=p_user) then
    raise exception 'RUN_OWNER_MISMATCH';
  end if;
  insert into telemetry_private.ai_run_measurements
    (run_id,user_id,status,duration_ms,first_output_ms,tools,models)
  values(p_run,p_user,p_status,p_duration,p_first_output,p_tools,p_models)
  on conflict(run_id) do nothing;
end $$;
revoke all on function public.telemetry_record_ai_run(uuid,uuid,text,integer,integer,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.telemetry_record_ai_run(uuid,uuid,text,integer,integer,jsonb,jsonb)
  to service_role;
grant select on public.reasonai_runs,public.reasonai_conversations to service_role;
commit;
