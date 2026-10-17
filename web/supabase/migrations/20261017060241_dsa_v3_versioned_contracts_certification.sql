-- PROPOSED schema only. No approvals, fixture changes or production data seeds.
-- Apply after the board helper and original execution jobs migrations.
create table dsa_execution_private.v3_contracts (
  problem_version_id uuid not null references public.dsa_problem_versions(id),
  language text not null default 'python' check(language='python'),
  contract jsonb not null check(jsonb_typeof(contract)='object' and octet_length(contract::text)<=16384),
  source_url text not null check(source_url ~ '^https?://'),
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  source_notice text check(length(source_notice)<=500),
  status text not null default 'draft' check(status in ('draft','approved','revoked')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_evidence jsonb not null default '{}' check(jsonb_typeof(review_evidence)='object' and octet_length(review_evidence::text)<=32768),
  primary key(problem_version_id,language),
  check(status<>'approved' or (reviewed_by is not null and reviewed_at is not null and review_evidence<>'{}'::jsonb))
);
create table dsa_execution_private.v3_certification_runs (
  id uuid primary key default gen_random_uuid(),
  problem_version_id uuid not null references public.dsa_problem_versions(id),
  suite_id uuid not null references public.dsa_test_suites(id),
  language text not null default 'python' check(language='python'),
  contract_sha256 text not null check(contract_sha256 ~ '^[a-f0-9]{64}$'),
  fixtures_sha256 text not null check(fixtures_sha256 ~ '^[a-f0-9]{64}$'),
  harness_sha256 text not null check(harness_sha256 ~ '^[a-f0-9]{64}$'),
  checker_version text not null default 'reasonai-fixed-checkers:1',
  starter_version text not null default 'reasonai-typed-starter:1',
  manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  checks jsonb not null default '{}' check(jsonb_typeof(checks)='object'),
  evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=65536),
  status text not null default 'pending' check(status in ('pending','approved','revoked')),
  reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,created_at timestamptz not null default now(),
  check(status<>'approved' or (reviewed_by is not null and reviewed_at is not null and evidence<>'{}'::jsonb and checks @>
    '{"statement":true,"source":true,"adapter":true,"starter":true,"publicFixtures":true,"hiddenFixtures":true,"independentOracle":true,"checker":true,"duplicateAudit":true,"overlapAudit":true,"boundaryCoverage":true,"stressCoverage":true,"realPython":true,"judgeVerdicts":true,"sandboxCompatibility":true,"certificateEligibility":true}'::jsonb))
);
create index dsa_v3_certification_version on dsa_execution_private.v3_certification_runs(problem_version_id,suite_id,created_at desc);
alter table dsa_execution_private.v3_contracts enable row level security;
alter table dsa_execution_private.v3_certification_runs enable row level security;
revoke all on dsa_execution_private.v3_contracts,dsa_execution_private.v3_certification_runs from public,anon,authenticated;
grant select,insert,update,delete on dsa_execution_private.v3_contracts,dsa_execution_private.v3_certification_runs to service_role;
alter table dsa_execution_private.certificates add column certification_run_id uuid references dsa_execution_private.v3_certification_runs(id);

create function dsa_execution_private.v3_fixture_sha(p_suite uuid) returns text
language sql stable security invoker set search_path='' as $$
  select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('id',t.id,'visibility',t.visibility,
    'input',t.input_json,'expected',t.expected_json,'validation',t.validation_status,'fixtureRef',t.fixture_ref)
    order by t.ordinal,t.id),'[]'::jsonb)::text,'UTF8')),'hex') from public.dsa_test_cases t where t.suite_id=p_suite;
$$;
revoke all on function dsa_execution_private.v3_fixture_sha(uuid) from public,anon,authenticated;
grant execute on function dsa_execution_private.v3_fixture_sha(uuid) to service_role;

create function public.dsa_v3_problem_contract(p_problem uuid,p_version uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('problemId',p_problem,'problemVersionId',p_version,'contract',r.contract,
    'contractRevision',encode(sha256(convert_to(r.contract::text,'UTF8')),'hex'),'sourceNotice',r.source_notice)
  from dsa_execution_private.v3_contracts r join public.dsa_problem_versions v on v.id=r.problem_version_id
  join public.dsa_problem_definitions def on def.id=v.definition_id and def.content_item_id=p_problem
  where r.problem_version_id=p_version and r.language='python' and r.status='approved'
    and (select auth.uid()) is not null and v.status='published'
    and v.provenance #> '{quality_review_20261015,publish_approved}'='true'::jsonb
    and exists(select 1 from public.content_items i join public.content_versions b
      on b.id=i.current_published_version_id and b.content_item_id=i.id
      join public.domains d on d.id=i.domain_id and d.slug='dsa' and d.is_active
      where i.id=p_problem and i.type::text='problem' and i.archived_at is null
        and b.status::text='published' and b.published_at is not null);
$$;
revoke all on function public.dsa_v3_problem_contract(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dsa_v3_problem_contract(uuid,uuid) to authenticated;

-- Original legacy certificates remain compatible. Typed V3 contracts require an
-- independently approved, exact-hash ledger entry; changed fixtures revoke access.
create or replace function dsa_execution_private.evaluation_plan(p_problem uuid,p_version uuid,p_mode text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_suite uuid; c dsa_execution_private.certificates%rowtype; r dsa_execution_private.v3_contracts%rowtype;
  proof dsa_execution_private.v3_certification_runs%rowtype; v_cases jsonb; v_count integer; extra jsonb:='{}';
begin
  if p_mode not in ('run','submit') then return null; end if;
  perform 1 from public.content_items i join public.domains d on d.id=i.domain_id and d.slug='dsa' and d.is_active
  join public.content_versions b on b.id=i.current_published_version_id and b.content_item_id=i.id
  join public.dsa_problem_definitions def on def.content_item_id=i.id
  join public.dsa_problem_versions v on v.id=def.current_version_id and v.definition_id=def.id
  where i.id=p_problem and v.id=p_version and i.type::text='problem' and i.archived_at is null
    and b.status::text='published' and b.published_at is not null and v.status='published'
    and v.provenance #> '{quality_review_20261015,publish_approved}'='true'::jsonb
    and (v.specification->'supported_languages' @> '["python"]'::jsonb or exists(
      select 1 from dsa_execution_private.v3_contracts contract where contract.problem_version_id=v.id and contract.status='approved' and contract.language='python'));
  if not found then return null; end if;
  select s.id into v_suite from public.dsa_test_suites s where s.problem_version_id=p_version order by s.suite_version desc,s.created_at desc,s.id desc limit 1;
  if not exists(select 1 from public.dsa_test_suites s where s.id=v_suite and s.status='published') then return null; end if;
  select * into c from dsa_execution_private.certificates cert where cert.suite_id=v_suite and cert.problem_version_id=p_version
    and cert.revoked_at is null and (case when p_mode='run' then cert.public_run_approved else cert.hidden_submit_approved end);
  if not found then return null; end if;
  if c.contract ? 'adapter' then
    select * into r from dsa_execution_private.v3_contracts where problem_version_id=p_version and language='python' and status='approved' and contract=c.contract;
    if not found then return null; end if;
    select * into proof from dsa_execution_private.v3_certification_runs where id=c.certification_run_id
      and problem_version_id=p_version and suite_id=v_suite and language='python' and status='approved'
      and contract_sha256=encode(sha256(convert_to(c.contract::text,'UTF8')),'hex')
      and fixtures_sha256=dsa_execution_private.v3_fixture_sha(v_suite);
    if not found then return null; end if;
    extra:=jsonb_build_object('harnessSha256',proof.harness_sha256,'certificationRunId',proof.id,
      'contractRevision',proof.contract_sha256,'fixturesRevision',proof.fixtures_sha256);
    if exists(select 1 from public.dsa_test_cases t where t.suite_id=v_suite and (t.validation_status<>'verified' or t.input_json is null or t.fixture_ref is not null)) then return null; end if;
  end if;
  if not exists(select 1 from public.dsa_test_suites s where s.id=v_suite and s.checker_type=
    case c.contract->>'checker' when 'exact_json' then 'exact' when 'unordered_json' then 'unordered'
      when 'numeric' then 'numeric_tolerance' when 'numeric_json' then 'numeric_tolerance'
      when 'unordered_triplets' then 'custom' when 'two_sum_indices' then 'custom' when 'topological_order' then 'custom' else '' end) then return null; end if;
  if p_mode='submit' and (not exists(select 1 from public.dsa_test_cases t where t.suite_id=v_suite and t.visibility='hidden')
    or exists(select 1 from public.dsa_test_cases t where t.suite_id=v_suite and (t.validation_status<>'verified' or t.input_json is null or t.fixture_ref is not null))) then return null; end if;
  select count(*),jsonb_agg(jsonb_build_object('id',t.id,'input',t.input_json,'expected',t.expected_json,'visibility',t.visibility) order by t.ordinal,t.id)
  into v_count,v_cases from public.dsa_test_cases t where t.suite_id=v_suite and t.validation_status='verified' and t.input_json is not null and t.fixture_ref is null and (p_mode='submit' or t.visibility='public');
  if v_count=0 or v_count>100 then return null; end if;
  return jsonb_build_object('certificateId',c.id,'suiteId',v_suite,'problemId',p_problem,'problemVersionId',p_version,
    'contract',c.contract,'exposeCounts',c.expose_counts,'cases',v_cases)||extra;
end $$;
