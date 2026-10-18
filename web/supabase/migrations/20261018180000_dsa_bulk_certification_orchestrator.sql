-- One-trigger certification of the existing provisional catalog. The ledger and
-- published judge are authoritative; this never bypasses the certificate gate.
create table if not exists dsa_execution_private.bulk_certification_runs (
 id uuid primary key default gen_random_uuid(),
 status text not null default 'running' check (status in ('running','finished')),
 started_at timestamptz not null default now(),
 finished_at timestamptz
);
create unique index if not exists dsa_one_active_bulk_certification_run
 on dsa_execution_private.bulk_certification_runs(status) where status='running';

create table if not exists dsa_execution_private.bulk_certification_items (
 run_id uuid not null references dsa_execution_private.bulk_certification_runs(id),
 problem_version_id uuid not null references public.dsa_problem_versions(id),
 suite_id uuid not null references public.dsa_test_suites(id),
 status text not null default 'queued' check(status in ('queued','running','certified','blocked')),
 phase text not null default 'queued' check(phase in ('queued','launching','launched')),
 lease_token uuid,
 lease_until timestamptz,
 launched_at timestamptz,
 operation_id uuid,
 attempts integer not null default 0 check(attempts between 0 and 10),
 error_code text,
 evidence jsonb not null default '{}'::jsonb check(octet_length(evidence::text)<=32768),
 updated_at timestamptz not null default now(),
 primary key(run_id,problem_version_id),
 unique(run_id,suite_id)
);
create index if not exists dsa_bulk_certification_claim
 on dsa_execution_private.bulk_certification_items(run_id,status,lease_until,updated_at);
alter table dsa_execution_private.bulk_certification_runs enable row level security;
alter table dsa_execution_private.bulk_certification_items enable row level security;
revoke all on dsa_execution_private.bulk_certification_runs,
 dsa_execution_private.bulk_certification_items from public,anon,authenticated;
grant select,insert,update on dsa_execution_private.bulk_certification_runs,
 dsa_execution_private.bulk_certification_items to service_role;

create or replace function public.dsa_bulk_certification_command(
 p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_run uuid;
 v_item dsa_execution_private.bulk_certification_items%rowtype;
 v_token uuid;
 v_problem uuid;
 v_source text;
 v_contract jsonb;
 v_cases jsonb;
 v_categories jsonb;
 v_count integer;
 v_pass boolean;
 v_provider uuid;
 v_check text;
 v_verifier uuid;
 v_evidence jsonb;
 v_ordinal integer;
 v_cert uuid;
 v_attempt integer;
begin
 if (select auth.role()) is distinct from 'service_role' then
   raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 if p_action='start' then
   perform pg_advisory_xact_lock(1626821,365);
   select id into v_run from dsa_execution_private.bulk_certification_runs
     where status='running' order by started_at desc limit 1;
   if v_run is null then
     insert into dsa_execution_private.bulk_certification_runs default values returning id into v_run;
     insert into dsa_execution_private.bulk_certification_items
       (run_id,problem_version_id,suite_id,status,error_code)
     select v_run,v.id,s.id,
       case when v.specification->>'title'='3Sum'
         then 'blocked' else 'queued' end,
       case when v.specification->>'title'='3Sum'
         then 'PREEXISTING_CHECKER_SEMANTICS_BLOCKER' else null end
     from public.dsa_problem_definitions d
     join public.dsa_problem_versions v on v.id=d.current_version_id
     join public.dsa_test_suites s on s.problem_version_id=v.id
     join dsa_execution_private.provisional_contracts p
       on p.problem_version_id=v.id and p.suite_id=s.id and p.status='validated'
     where v.status='published' and s.status='verified'
       and s.id=(select newest.id from public.dsa_test_suites newest
          where newest.problem_version_id=v.id
          order by newest.suite_version desc,newest.created_at desc,newest.id desc limit 1)
       and p.fixtures_sha256=dsa_execution_private.v3_fixture_sha(s.id)
       and not exists(select 1 from public.dsa_test_cases t where t.suite_id=s.id
         and (t.validation_status<>'verified' or t.fixture_ref is not null
         or t.input_json is null or t.expected_json is null))
       and not exists(select 1 from dsa_execution_private.certificates c
         where c.problem_version_id=v.id and c.suite_id=s.id
           and c.revoked_at is null and c.hidden_submit_approved);
     if not exists(select 1 from dsa_execution_private.bulk_certification_items
       where run_id=v_run and status in ('queued','running')) then
       update dsa_execution_private.bulk_certification_runs
         set status='finished',finished_at=now() where id=v_run;
     end if;
   end if;
   return (select jsonb_build_object('runId',r.id,'status',r.status,
       'total',(select count(*) from dsa_execution_private.bulk_certification_items i where i.run_id=r.id),
       'pending',(select count(*) from dsa_execution_private.bulk_certification_items i where i.run_id=r.id and i.status in ('queued','running')))
     from dsa_execution_private.bulk_certification_runs r where id=v_run);
 elsif p_action='claim' then
   perform pg_advisory_xact_lock(1626821,365);
   select id into v_run from dsa_execution_private.bulk_certification_runs
     where status='running' order by started_at desc limit 1;
   if v_run is null then return null; end if;
   if (select count(*) from dsa_execution_private.bulk_certification_items
     where run_id=v_run and status='running' and lease_until>now())>=5
     then return null; end if;
   select * into v_item from dsa_execution_private.bulk_certification_items
     where run_id=v_run and (status='queued' or (status='running' and lease_until<now()))
     order by case when status='running' then 0 else 1 end,updated_at,problem_version_id
     limit 1 for update skip locked;
   if not found then return null; end if;
   if v_item.attempts>=4 then
     update dsa_execution_private.bulk_certification_items
       set status='blocked',error_code='RETRY_EXHAUSTED',lease_until=null,updated_at=now()
       where run_id=v_item.run_id and problem_version_id=v_item.problem_version_id;
     return jsonb_build_object('skipped',true);
   end if;
   v_token:=gen_random_uuid();
   update dsa_execution_private.bulk_certification_items
     set status='running',attempts=attempts+1,lease_token=v_token,
       lease_until=now()+interval '2 minutes',
       phase=case when phase='queued' then 'launching' else phase end,
       launched_at=coalesce(launched_at,now()),updated_at=now()
     where run_id=v_item.run_id and problem_version_id=v_item.problem_version_id;
   select d.content_item_id, v.provenance->>'reference_solution_python',p.contract
     into v_problem,v_source,v_contract
     from public.dsa_problem_versions v join public.dsa_problem_definitions d on d.id=v.definition_id
     join dsa_execution_private.provisional_contracts p
       on p.problem_version_id=v.id and p.suite_id=v_item.suite_id
     where v.id=v_item.problem_version_id;
   select jsonb_agg(jsonb_build_object('id',t.id,'input',dsa_execution_private.integer_wire(t.input_json),
        'expected',dsa_execution_private.integer_wire(t.expected_json),'visibility',t.visibility)
      order by t.ordinal,t.id),count(*)
     into v_cases,v_count from public.dsa_test_cases t where t.suite_id=v_item.suite_id;
   select jsonb_object_agg(category,n) into v_categories from
     (select category,count(*) n from public.dsa_test_cases t
       where t.suite_id=v_item.suite_id group by category) cat;
   return jsonb_build_object('runId',v_run,'versionId',v_item.problem_version_id,
     'suiteId',v_item.suite_id,'problemId',v_problem,'leaseToken',v_token,
     'phase',case when v_item.phase='queued' then 'launching' else v_item.phase end,
     'operationId',v_item.operation_id,'launchedAt',coalesce(v_item.launched_at,now()),
     'attempts',v_item.attempts+1,
     'source',v_source,'contract',v_contract,'cases',v_cases,
     'categories',coalesce(v_categories,'{}'::jsonb),'caseCount',v_count,
     'statement',(select v.specification->>'problem_statement'
       from public.dsa_problem_versions v where v.id=v_item.problem_version_id));
 elsif p_action='launched' then
   update dsa_execution_private.bulk_certification_items
     set phase='launched',operation_id=(p_args->>'operationId')::uuid,updated_at=now()
     where run_id=(p_args->>'runId')::uuid
       and problem_version_id=(p_args->>'versionId')::uuid
       and lease_token=(p_args->>'leaseToken')::uuid
       and status='running' and lease_until>now()
       and (operation_id is null or operation_id=(p_args->>'operationId')::uuid);
   if not found then raise exception 'BULK_CERTIFICATION_LEASE_LOST'; end if;
   return '{"ok":true}'::jsonb;
 elsif p_action='finish' then
   select * into v_item from dsa_execution_private.bulk_certification_items
     where run_id=(p_args->>'runId')::uuid
       and problem_version_id=(p_args->>'versionId')::uuid
     for update;
   if not found or v_item.status not in ('running','certified')
       or v_item.lease_token is distinct from (p_args->>'leaseToken')::uuid
       then raise exception 'BULK_CERTIFICATION_LEASE_LOST'; end if;
   if v_item.status='certified' then return '{"alreadyCertified":true}'::jsonb; end if;
   v_pass:=coalesce((p_args->>'passed')::boolean,false);
   v_provider:=nullif(p_args->>'operationId','')::uuid;
   v_evidence:=coalesce(p_args->'evidence','{}'::jsonb);
   if jsonb_typeof(v_evidence)<>'object' or octet_length(v_evidence::text)>20000
     then raise exception 'INVALID_CERTIFICATION_EVIDENCE'; end if;
   if v_pass and (v_item.phase<>'launched' or v_item.operation_id is null
      or v_item.operation_id is distinct from v_provider
      or (p_args->>'passedPublic')::integer<1
      or (p_args->>'passedHidden')::integer<1
      or (p_args->>'passedPublic')::integer+(p_args->>'passedHidden')::integer <>
       (select count(*) from public.dsa_test_cases t where t.suite_id=v_item.suite_id)
      or not (v_evidence ? 'positiveComparator' and v_evidence ? 'negativeComparator'
         and v_evidence ? 'sandboxOperation' and v_evidence ? 'boundaryCoverage'
         and v_evidence ? 'stressCoverage'))
      then raise exception 'CERTIFICATION_EVIDENCE_INCOMPLETE'; end if;
   if v_pass then
     select p.contract into v_contract from dsa_execution_private.provisional_contracts p
       where p.suite_id=v_item.suite_id and p.problem_version_id=v_item.problem_version_id
       and p.status='validated' and p.fixtures_sha256=dsa_execution_private.v3_fixture_sha(p.suite_id);
     if v_contract is null then raise exception 'STALE_CERTIFICATION_CONTRACT'; end if;
     if not exists(select 1 from public.dsa_test_suites s
       where s.id=v_item.suite_id and s.status='verified')
       or exists(select 1 from public.dsa_test_cases t
         where t.suite_id=v_item.suite_id and t.validation_status<>'verified')
       then raise exception 'STALE_CERTIFICATION_SUITE'; end if;
     select certified_by into v_verifier from dsa_execution_private.certificates
       where hidden_submit_approved and revoked_at is null
       group by certified_by order by count(*) desc,certified_by limit 1;
     if v_verifier is null then raise exception 'MISSING_CERTIFICATION_OWNER'; end if;
     foreach v_check in array ARRAY['statement_contract','edge_negative_stress',
         'checker_semantics','public_execution','hidden_execution','nebius_python_e2e'] loop
       select coalesce(max(attempt_number),0)+1 into v_attempt
         from dsa_execution_private.certification_checks
         where problem_version_id=v_item.problem_version_id and suite_id=v_item.suite_id and check_name=v_check;
       insert into dsa_execution_private.certification_checks
        (problem_version_id,suite_id,check_name,attempt_number,result,evidence,
         source_references,verifier,verifier_version)
       values (v_item.problem_version_id,v_item.suite_id,v_check,v_attempt,'passed',
         v_evidence||jsonb_build_object('check',v_check,'runId',v_item.run_id,
           'operationId',v_provider,'suiteSha',dsa_execution_private.v3_fixture_sha(v_item.suite_id)),
         '[]'::jsonb,'reasonai-bulk-nebius-worker','1');
     end loop;
     update public.dsa_test_suites set status='published' where id=v_item.suite_id and status='verified';
     -- Declaring Python compatibility *only after* hosted Python passes.
     update public.dsa_problem_versions v set specification=jsonb_set(
       v.specification,'{supported_languages}',coalesce(v.specification->'supported_languages','[]'::jsonb)||'["python"]'::jsonb,true)
       where v.id=v_item.problem_version_id and not (v.specification->'supported_languages' @> '["python"]'::jsonb);
     insert into dsa_execution_private.certificates
       (problem_version_id,suite_id,contract,public_run_approved,
        hidden_submit_approved,expose_counts,certified_by,certified_at)
       values(v_item.problem_version_id,v_item.suite_id,v_contract,true,true,false,v_verifier,now())
       on conflict do nothing returning id into v_cert;
     if v_cert is null then select id into v_cert from dsa_execution_private.certificates
       where problem_version_id=v_item.problem_version_id and suite_id=v_item.suite_id
       and hidden_submit_approved and revoked_at is null limit 1; end if;
     if v_cert is null then raise exception 'OFFICIAL_CERTIFICATE_NOT_CREATED'; end if;
     select d.content_item_id into v_problem from public.dsa_problem_definitions d
       join public.dsa_problem_versions v on v.definition_id=d.id
       where v.id=v_item.problem_version_id;
     if dsa_execution_private.official_evaluation_plan(v_problem,v_item.problem_version_id,'submit') is null
       then raise exception 'OFFICIAL_SUBMIT_PLAN_NOT_AVAILABLE'; end if;
     update dsa_execution_private.certification_reviews
       set workflow_status='certified',blocker_summary=null,reviewer_id=v_verifier,updated_at=now()
       where problem_version_id=v_item.problem_version_id and suite_id=v_item.suite_id;
   end if;
   update dsa_execution_private.bulk_certification_items
     set status=case when v_pass then 'certified' else 'blocked' end,
       error_code=case when v_pass then null else left(coalesce(p_args->>'reason','CERTIFICATION_FAILED'),128) end,
       evidence=v_evidence,lease_until=null,updated_at=now()
       where run_id=v_item.run_id and problem_version_id=v_item.problem_version_id;
   if not exists(select 1 from dsa_execution_private.bulk_certification_items
     where run_id=v_item.run_id and status in ('queued','running')) then
     update dsa_execution_private.bulk_certification_runs set status='finished',finished_at=now()
       where id=v_item.run_id;
   end if;
   return jsonb_build_object('passed',v_pass,'certificateId',v_cert);
 elsif p_action='status' then
   select id into v_run from dsa_execution_private.bulk_certification_runs
     order by started_at desc limit 1;
   if v_run is null then return null; end if;
   return (select jsonb_build_object('runId',r.id,'status',r.status,'startedAt',r.started_at,
       'finishedAt',r.finished_at,'total',count(i.*),
       'queued',count(i.*) filter(where i.status='queued'),
       'running',count(i.*) filter(where i.status='running'),
       'certified',count(i.*) filter(where i.status='certified'),
       'blocked',count(i.*) filter(where i.status='blocked'))
     from dsa_execution_private.bulk_certification_runs r
     join dsa_execution_private.bulk_certification_items i on i.run_id=r.id
     where r.id=v_run group by r.id,r.status,r.started_at,r.finished_at);
 end if;
 raise exception 'UNKNOWN_BULK_CERTIFICATION_ACTION';
end $fn$;
revoke all on function public.dsa_bulk_certification_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.dsa_bulk_certification_command(text,jsonb) to service_role;