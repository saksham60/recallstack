
-- Independent offline exhaustive-oracle comparison of all 36 UNIQUE v2 3Sum fixtures
-- completed 2026-10-16. This is NOT hosted judge certification.
insert into dsa_execution_private.certification_checks(
 problem_version_id,suite_id,check_name,attempt_number,result,
 evidence,source_references,verifier,verifier_version,failure_code)
select s.problem_version_id,s.id,
 'independent_oracle',1,'passed',
 jsonb_build_object('cases_checked',36,'expected_mismatches',0,
  'oracle','O(n^3) triple enumeration on distinct indices',
  'ordering','triples ascending, answers lexicographic',
  'verification_scope','offline independent review',
  'nebius_verified',false,
  'fixture_set_checksum',(
   select md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,
    '|' order by t.ordinal)) from public.dsa_test_cases t where t.suite_id=s.id)),
 '[{"artifact":"dsa_test_cases","suite_version":2}]',
 'ReasonAI independent verifier','js-bruteforce-20261016',null
from public.dsa_test_suites s
where s.problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and s.suite_version=2;
insert into dsa_execution_private.certification_checks(
 problem_version_id,suite_id,check_name,attempt_number,result,evidence,
 source_references,verifier,verifier_version,failure_code)
select s.problem_version_id,s.id,x.check_name,1,'blocked',x.evidence,
 '[{"artifact":"dsa_problem_versions","version":2}]',
 'ReasonAI certification audit','20261016',x.error_code
from public.dsa_test_suites s cross join (values
 ('statement_contract','{"review_required":"source attribution and API input binding"}'::jsonb,'SOURCE_CONTRACT_REVIEW_PENDING'),
 ('nebius_python_e2e','{"review_required":"trusted hosted Nebius Python submit smoke"}'::jsonb,'PROVIDER_E2E_NOT_RUN')
) x(check_name,evidence,error_code)
where s.problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and s.suite_version=2;
update dsa_execution_private.certification_reviews
set workflow_status='blocked',
 blocker_summary='v2: 36 unique oracle-checked fixtures; source contract review + hosted Nebius Python E2E remain blocked',
 updated_at=now()
where problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469'
and suite_id=(select id from public.dsa_test_suites
 where problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and suite_version=2);
