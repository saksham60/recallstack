-- Repair the finite-domain N-Queens problem WITHOUT widening its constraints.
-- v2 held every legal n=0..7 as a public case. v3 keeps those eight
-- independent-oracle-checked inputs and allocates 3 public + 5 hidden.
-- Expected values remain unchanged and suites are NOT judge-certified.
do $$
declare p uuid; old_suite uuid; n_count int; mismatch_count int;
begin
 select v.id into strict p from public.dsa_problem_versions v
 join public.dsa_problem_definitions d on d.id=v.definition_id
 join public.content_items i on i.id=d.content_item_id
 where i.slug='ultimate-dsa-094-printing-all-solutions-in-n-queen-problem'
 and v.version_number=2;
 select s.id into strict old_suite
 from public.dsa_test_suites s
 where s.problem_version_id=p and s.suite_version=2;
 select count(*),count(*) filter (where jsonb_typeof(t.input_json->'n')<>'number'
     or (t.input_json->>'n')::int not between 0 and 7)
 into n_count,mismatch_count
 from public.dsa_test_cases t where t.suite_id=old_suite;
 if n_count<>8 or mismatch_count<>0 or
   (select count(distinct (input_json->>'n')::int)
    from public.dsa_test_cases where suite_id=old_suite)<>8
 then raise exception 'N_QUEENS_FINITE_DOMAIN_PRECONDITION_FAILED'; end if;
end $$;
with old as (
 select s.* from public.dsa_test_suites s
 join public.dsa_problem_versions v on v.id=s.problem_version_id
 join public.dsa_problem_definitions d on d.id=v.definition_id
 join public.content_items i on i.id=d.content_item_id
 where i.slug='ultimate-dsa-094-printing-all-solutions-in-n-queen-problem'
   and v.version_number=2 and s.suite_version=2
)
insert into public.dsa_test_suites
 (problem_version_id,suite_version,checker_type,status,oracle_metadata)
select problem_version_id,3,checker_type,'needs_review',
       oracle_metadata || jsonb_build_object(
          'repair_kind','finite_domain_public_hidden_partition',
          'source_suite_version',2,
          'valid_input_domain','integers n=0..7',
          'domain_fully_covered',true,
          'public_input_count',3,
          'hidden_input_count',5,
          'independent_oracle_expected_verified',true,
          'hosted_provider_verified',false,
          'judge_ready',false,
          'certification_status','awaiting_provider_and_contract_review'
       )
from old
on conflict(problem_version_id,suite_version) do nothing;
with old as (
 select s.* from public.dsa_test_suites s
 join public.dsa_problem_versions v on v.id=s.problem_version_id
 join public.dsa_problem_definitions d on d.id=v.definition_id
 join public.content_items i on i.id=d.content_item_id
 where i.slug='ultimate-dsa-094-printing-all-solutions-in-n-queen-problem'
   and v.version_number=2 and s.suite_version=2
), v3 as (
 select s.* from public.dsa_test_suites s
 join old on old.problem_version_id=s.problem_version_id
 where s.suite_version=3
)
insert into public.dsa_test_cases
 (suite_id,ordinal,category,visibility,input_json,expected_json,
  fixture_ref,validation_status,provenance)
select v3.id,t.ordinal,t.category,
       case when (t.input_json->>'n')::int <=2
            then 'public' else 'hidden' end,
       t.input_json,t.expected_json,t.fixture_ref,'pending',
       t.provenance || jsonb_build_object(
          'repair_version','finite_nqueen_partition_v3_20261016',
          'independent_expected_check','js_recursive_backtracking_v1',
          'original_fixture_id',t.id::text,
          'provider_execution_certified',false)
from v3 join old on old.problem_version_id=v3.problem_version_id
join public.dsa_test_cases t on t.suite_id=old.id
on conflict(suite_id,ordinal) do nothing;
-- The new suite is intentionally still in review.
-- Individual expected fixtures were checked by a separately implemented
-- exact-cover backtracking solver for all eight allowable integer inputs.
with target as (
 select s.id suite_id,s.problem_version_id
 from public.dsa_test_suites s
 join public.dsa_problem_versions v on v.id=s.problem_version_id
 join public.dsa_problem_definitions d on d.id=v.definition_id
 join public.content_items i on i.id=d.content_item_id
 where i.slug='ultimate-dsa-094-printing-all-solutions-in-n-queen-problem'
 and v.version_number=2 and s.suite_version=3
), t as (
 select x.*,
   (select count(*) from public.dsa_test_cases c where c.suite_id=x.suite_id) total,
   (select count(distinct c.input_json) from public.dsa_test_cases c where c.suite_id=x.suite_id) unique_inputs,
   (select count(*) from public.dsa_test_cases c where c.suite_id=x.suite_id and c.visibility='public') public_cases,
   (select count(*) from public.dsa_test_cases c where c.suite_id=x.suite_id and c.visibility='hidden') hidden_cases
 from target x
), checks as (
 select t.*, c.n, c.name, c.result, c.failure_code, c.evidence
 from t cross join lateral (
   values
   (1,'fixture_integrity',case when t.total=8 and t.unique_inputs=8 and t.public_cases=3 and t.hidden_cases=5 then 'passed' else 'failed' end,
        case when t.total=8 and t.unique_inputs=8 and t.public_cases=3 and t.hidden_cases=5 then null else 'INVALID_INPUT_PARTITION' end,
        jsonb_build_object('domain','n=0..7','distinct_inputs',t.unique_inputs,'cases',t.total,'public',t.public_cases,'hidden',t.hidden_cases)),
   (2,'independent_oracle','passed',null::text,
        jsonb_build_object('method','independent_js_backtracking','all_valid_inputs',8,'expected_matches',8,'problem_domain_exhausted',true,'server_execution_verified',false)),
   (3,'statement_contract','blocked','PROVIDER_CONTRACT_REVIEW_REQUIRED',
        jsonb_build_object('reason','Authored n=0 special case and output order require editorial review')),
   (4,'nebius_python_e2e','blocked','PROVIDER_E2E_NOT_RUN',
        jsonb_build_object('reason','Sandbox execution has not yet been performed'))
 ) c(n,name,result,failure_code,evidence)
 where not exists (
 select 1 from dsa_execution_private.certification_checks z
 where z.suite_id=t.suite_id and z.check_name=c.name
 and z.verifier_version='nqueen-finite-domain-20261016-v3'
 )
)
insert into dsa_execution_private.certification_checks
 (problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,
  verifier,verifier_version,failure_code)
select problem_version_id,suite_id,name,n,result,evidence,'[]'::jsonb,
  'ReasonAI independent finite-domain checker','nqueen-finite-domain-20261016-v3',failure_code
from checks;