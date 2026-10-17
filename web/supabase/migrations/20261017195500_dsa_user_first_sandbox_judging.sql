-- Learner-first judging: published DSA problems can execute their current
-- test suite without certification, oracle-review, or approval-record gates.
-- Existing certificates and historical grading evidence are preserved.
-- This still requires a known Python invocation contract, an executable suite,
-- non-null bounded fixtures, publication, and a non-revoked server registry.
create or replace function dsa_execution_private.evaluation_plan(
  p_problem uuid, p_version uuid, p_mode text
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_official jsonb;
  v_contract dsa_execution_private.provisional_contracts%rowtype;
  v_suite uuid;
  v_cases jsonb;
  v_count integer;
begin
  if p_mode not in ('run', 'submit') then return null; end if;

  -- Retain already-earned official evidence for the ten certified suites.
  -- Every other published problem uses exactly the same sandbox judge.
  v_official := dsa_execution_private.official_evaluation_plan(p_problem,p_version,p_mode);
  if v_official is not null then return v_official; end if;

  select a.* into v_contract
    from dsa_execution_private.provisional_contracts a
    join public.dsa_problem_versions v on v.id = a.problem_version_id
    join public.dsa_problem_definitions def on def.id = v.definition_id
      and def.current_version_id = v.id and def.content_item_id = p_problem
    join public.content_items i on i.id = def.content_item_id
      and i.type::text = 'problem' and i.archived_at is null
    join public.content_versions b on b.id = i.current_published_version_id
      and b.content_item_id = i.id
      and b.status::text = 'published' and b.published_at is not null
    join public.domains d on d.id = i.domain_id and d.slug = 'dsa' and d.is_active
   where v.id = p_version and v.status = 'published' and a.status <> 'revoked';
  if not found then return null; end if;

  -- Use the current suite, including suites fixed after their earlier review.
  -- A suite marked draft or with missing fixtures cannot be judged safely.
  select s.id into v_suite from public.dsa_test_suites s
    where s.problem_version_id = p_version
      and s.status in ('needs_review','verified','published')
    order by s.suite_version desc, s.created_at desc, s.id desc limit 1;
  if v_suite is null then return null; end if;
  if exists (
    select 1 from public.dsa_test_cases t where t.suite_id = v_suite
      and (t.validation_status = 'rejected' or t.input_json is null
        or t.expected_json is null or t.fixture_ref is not null)
  ) or not exists (
    select 1 from public.dsa_test_cases t
      where t.suite_id = v_suite and t.visibility = 'public'
  ) or not exists (
    select 1 from public.dsa_test_cases t
      where t.suite_id = v_suite and t.visibility = 'hidden'
  ) then return null; end if;

  select count(*),jsonb_agg(
    jsonb_build_object('id',t.id,
      'input',dsa_execution_private.integer_wire(t.input_json),
      'expected',dsa_execution_private.integer_wire(t.expected_json),
      'visibility',t.visibility) order by t.ordinal,t.id
  ) into v_count,v_cases from public.dsa_test_cases t
    where t.suite_id = v_suite and (p_mode = 'submit' or t.visibility = 'public');
  if v_count not between 1 and 100 then return null; end if;

  -- "provisional" remains an internal grading provenance identifier until the
  -- storage/AI contracts are versioned; it is not a learner admission gate.
  -- A passing suite is only a passing suite, not an independent certification.
  return jsonb_build_object(
    'gradingLevel','provisional',
    'provisionalContractId',v_contract.id,
    'suiteId',v_suite,'problemId',p_problem,'problemVersionId',p_version,
    'contract',v_contract.contract,
    'harnessSha256',v_contract.harness_sha256,
    'contractRevision',encode(sha256(convert_to(v_contract.contract::text,'UTF8')),'hex'),
    'fixturesRevision',dsa_execution_private.v3_fixture_sha(v_suite),
    'exposeCounts',false,'cases',v_cases
  );
end $$;
revoke all on function dsa_execution_private.evaluation_plan(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function dsa_execution_private.evaluation_plan(uuid,uuid,text)
  to service_role;
