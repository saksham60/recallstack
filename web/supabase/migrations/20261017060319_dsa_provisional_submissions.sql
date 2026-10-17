-- Add provisional grading without modifying any official certificate/review or fixture.
-- Existing worker fences, quotas, frozen plans and hidden result redaction are retained.
create table dsa_execution_private.provisional_contracts (
 id uuid primary key default gen_random_uuid(),
 problem_version_id uuid not null unique references public.dsa_problem_versions(id),
 suite_id uuid not null references public.dsa_test_suites(id),
 contract jsonb not null check(jsonb_typeof(contract)='object' and octet_length(contract::text)<=16384),
 reference_sha256 text not null check(reference_sha256 ~ '^[a-f0-9]{64}$'),
 interface_sha256 text not null check(interface_sha256 ~ '^[a-f0-9]{64}$'),
 fixtures_sha256 text not null check(fixtures_sha256 ~ '^[a-f0-9]{64}$'),
 harness_sha256 text not null check(harness_sha256 ~ '^[a-f0-9]{64}$'),
 oracle_check_id uuid not null references dsa_execution_private.certification_checks(id),
 integrity_check_id uuid not null references dsa_execution_private.certification_checks(id),
 validation_evidence jsonb not null check(jsonb_typeof(validation_evidence)='object' and validation_evidence<>'{}'::jsonb),
 status text not null default 'validated' check(status in ('validated','revoked')),
 created_at timestamptz not null default now()
);
alter table dsa_execution_private.provisional_contracts enable row level security;
revoke all on dsa_execution_private.provisional_contracts from public,anon,authenticated;
grant select,insert,update,delete on dsa_execution_private.provisional_contracts to service_role;

-- Preserve numerics before the Supabase JSON response crosses JavaScript.
-- Objects containing the wire key are reserved and rejected rather than confused with numbers.
create function dsa_execution_private.integer_wire(v jsonb, depth integer default 0) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb;
begin
 if depth>32 then raise exception 'INTEGER_DEPTH_LIMIT'; end if;
 if jsonb_typeof(v)='number' and (v::text)::numeric=trunc((v::text)::numeric)
   and abs((v::text)::numeric)>9007199254740991 then
   if length(trunc((v::text)::numeric)::text)>1000 then raise exception 'INTEGER_SIZE_LIMIT'; end if;
   return jsonb_build_object('$reasonaiInteger',trunc((v::text)::numeric)::text);
 elsif jsonb_typeof(v)='array' then
   select coalesce(jsonb_agg(dsa_execution_private.integer_wire(value,depth+1) order by ordinal),'[]'::jsonb)
     into result from jsonb_array_elements(v) with ordinality a(value,ordinal);
   return result;
 elsif jsonb_typeof(v)='object' then
   if v ? '$reasonaiInteger' then raise exception 'RESERVED_INTEGER_KEY'; end if;
   select coalesce(jsonb_object_agg(key,dsa_execution_private.integer_wire(value,depth+1)),'{}'::jsonb)
     into result from jsonb_each(v);
   return result;
 end if;
 return v;
end $$;
revoke all on function dsa_execution_private.integer_wire(jsonb,integer) from public,anon,authenticated;
grant execute on function dsa_execution_private.integer_wire(jsonb,integer) to service_role;

-- Rename once; do not rewrite or weaken the official certification gate.
alter function dsa_execution_private.evaluation_plan(uuid,uuid,text) rename to official_evaluation_plan;
create function dsa_execution_private.evaluation_plan(p_problem uuid,p_version uuid,p_mode text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare official jsonb; r dsa_execution_private.provisional_contracts%rowtype; v_count integer; v_cases jsonb;
begin
 if p_mode not in ('run','submit') then return null; end if;
 official:=dsa_execution_private.official_evaluation_plan(p_problem,p_version,p_mode);
 if official is not null then return official; end if;
 select a.* into r from dsa_execution_private.provisional_contracts a
 join public.dsa_problem_versions v on v.id=a.problem_version_id
 join public.dsa_problem_definitions def on def.id=v.definition_id and def.current_version_id=v.id and def.content_item_id=p_problem
 join public.content_items i on i.id=def.content_item_id and i.type::text='problem' and i.archived_at is null
 join public.content_versions b on b.id=i.current_published_version_id and b.content_item_id=i.id and b.status::text='published' and b.published_at is not null
 join public.domains d on d.id=i.domain_id and d.slug='dsa' and d.is_active
 join public.dsa_test_suites s on s.id=a.suite_id and s.problem_version_id=v.id and s.status in ('needs_review','verified','published')
 where v.id=p_version and v.status='published' and a.status='validated'
   and v.provenance#>'{quality_review_20261015,publish_approved}'='true'::jsonb
   and a.reference_sha256=encode(sha256(convert_to(v.provenance->>'reference_solution_python','UTF8')),'hex')
   and a.interface_sha256=encode(sha256(convert_to(jsonb_build_object('statement',v.specification->'problem_statement','interface',v.specification->'function_contract')::text,'UTF8')),'hex')
   and a.fixtures_sha256=dsa_execution_private.v3_fixture_sha(a.suite_id)
   and a.suite_id=(select id from public.dsa_test_suites where problem_version_id=v.id order by suite_version desc,created_at desc,id desc limit 1)
   and a.oracle_check_id=(select c.id from dsa_execution_private.certification_checks c where c.problem_version_id=v.id and c.suite_id=s.id and c.check_name='independent_oracle' order by verified_at desc,id desc limit 1)
   and a.integrity_check_id=(select c.id from dsa_execution_private.certification_checks c where c.problem_version_id=v.id and c.suite_id=s.id and c.check_name='fixture_integrity' order by verified_at desc,id desc limit 1)
   and exists(select 1 from dsa_execution_private.certification_checks c where c.id=a.oracle_check_id and c.result='passed')
   and exists(select 1 from dsa_execution_private.certification_checks c where c.id=a.integrity_check_id and c.result='passed');
 if not found then return null; end if;
 if exists(select 1 from public.dsa_test_cases t where t.suite_id=r.suite_id
   and (t.validation_status='rejected' or t.input_json is null or t.expected_json is null or t.fixture_ref is not null))
   or not exists(select 1 from public.dsa_test_cases where suite_id=r.suite_id and visibility='hidden')
   or not exists(select 1 from public.dsa_test_cases where suite_id=r.suite_id and visibility='public') then return null; end if;
 select count(*),jsonb_agg(jsonb_build_object('id',t.id,'input',dsa_execution_private.integer_wire(t.input_json),
   'expected',dsa_execution_private.integer_wire(t.expected_json),'visibility',t.visibility) order by t.ordinal,t.id)
 into v_count,v_cases from public.dsa_test_cases t where t.suite_id=r.suite_id and (p_mode='submit' or t.visibility='public');
 if v_count not between 1 and 100 then return null; end if;
 return jsonb_build_object('gradingLevel','provisional','provisionalContractId',r.id,'suiteId',r.suite_id,
   'problemId',p_problem,'problemVersionId',p_version,'contract',r.contract,'harnessSha256',r.harness_sha256,
   'contractRevision',encode(sha256(convert_to(r.contract::text,'UTF8')),'hex'),
   'fixturesRevision',r.fixtures_sha256,'exposeCounts',false,'cases',v_cases);
end $$;
revoke all on function dsa_execution_private.evaluation_plan(uuid,uuid,text) from public,anon,authenticated;
grant execute on function dsa_execution_private.evaluation_plan(uuid,uuid,text) to service_role;

-- Authority comes from the immutable server plan, never a caller-supplied label.
create function dsa_execution_private.provisional_result_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.result is not null and new.plan->>'gradingLevel'='provisional' then
   new.result:=new.result||jsonb_build_object('gradingLevel','provisional');
   if new.result->>'verdict'='accepted' then
     new.result:=jsonb_set(new.result,'{verdict}','"provisional_pass"');
   end if;
 end if;
 return new;
end $$;
revoke all on function dsa_execution_private.provisional_result_guard() from public,anon,authenticated;
grant execute on function dsa_execution_private.provisional_result_guard() to service_role;
create trigger dsa_provisional_result_guard before insert or update on dsa_execution_private.jobs
 for each row execute function dsa_execution_private.provisional_result_guard();
create or replace function dsa_execution_private.job_view(j dsa_execution_private.jobs)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('submissionId',j.id,'problemId',j.request->>'problemId',
 'problemVersionId',j.request->>'problemVersionId','language',j.request->>'language','mode',j.request->>'mode',
 'status',j.status,'createdAt',j.created_at,'updatedAt',j.updated_at)
 ||case when j.plan->>'gradingLevel'='provisional' then jsonb_build_object('gradingLevel','provisional') else '{}'::jsonb end
 ||case when j.result is null then '{}'::jsonb else jsonb_build_object('result',j.result) end
 ||case when j.error is null then '{}'::jsonb else jsonb_build_object('error',j.error) end;
$$;
alter table public.dsa_code_intelligence_reports drop constraint dsa_code_intelligence_reports_verified_verdict_check;
alter table public.dsa_code_intelligence_reports add constraint dsa_code_intelligence_reports_verified_verdict_check
 check(verified_verdict in ('accepted','provisional_pass','passed_public_tests','wrong_answer','runtime_error','syntax_error','time_limit_exceeded','output_limit_exceeded'));
create index dsa_provisional_suite_idx on dsa_execution_private.provisional_contracts(suite_id);
create index dsa_provisional_oracle_idx on dsa_execution_private.provisional_contracts(oracle_check_id);
create index dsa_provisional_integrity_idx on dsa_execution_private.provisional_contracts(integrity_check_id);
