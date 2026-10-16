-- Audit exactly the latest suite of each published V2 DSA problem without changing
-- fixture validation_status, suite publication, judge certificates or eligibility.
with latest as (
 select distinct on (s.problem_version_id)
   s.id suite_id,s.problem_version_id,s.status,s.checker_type
 from public.dsa_test_suites s
 join public.dsa_problem_versions v on v.id=s.problem_version_id and v.version_number=2
 order by s.problem_version_id,s.suite_version desc,s.created_at desc
), summary as (
 select l.suite_id,l.problem_version_id,l.status,l.checker_type,
        count(t.id)::int case_count,
        count(distinct t.input_json)::int distinct_input_count,
        count(t.id) filter(where t.visibility='public')::int public_count,
        count(t.id) filter(where t.visibility='hidden')::int hidden_count,
        count(t.id) filter(where t.validation_status='rejected')::int rejected_count,
        count(t.id) filter(where t.input_json is null or t.expected_json is null)::int incomplete_count
 from latest l left join public.dsa_test_cases t on t.suite_id=l.suite_id
 group by l.suite_id,l.problem_version_id,l.status,l.checker_type
), assessed as (
 select *,
   (case_count=distinct_input_count and rejected_count=0 and incomplete_count=0
    and public_count>0 and hidden_count>0) ok
 from summary
), numbered as (
 select a.*,
    coalesce((select max(c.attempt_number) from dsa_execution_private.certification_checks c
              where c.problem_version_id=a.problem_version_id and c.suite_id=a.suite_id
                and c.check_name='fixture_integrity'),0)+1 attempt
 from assessed a
 where a.status='needs_review'
    and not exists(select 1 from dsa_execution_private.certification_checks c
     where c.problem_version_id=a.problem_version_id and c.suite_id=a.suite_id
       and c.check_name='fixture_integrity'
       and c.verifier_version='postgres-structural-20261016-v2')
)
insert into dsa_execution_private.certification_checks
 (problem_version_id,suite_id,check_name,attempt_number,result,evidence,
  source_references,verifier,verifier_version,failure_code)
select problem_version_id,suite_id,'fixture_integrity',attempt,
       case when ok then 'passed' else 'failed' end,
       jsonb_build_object('scope','structural_only',
         'case_count',case_count,'unique_inputs',distinct_input_count,
         'public_count',public_count,'hidden_count',hidden_count,
         'rejected_count',rejected_count,'incomplete_count',incomplete_count,
         'checker_type',checker_type,
         'oracle_verified',false,'provider_verified',false,
         'certification_issued',false),
       '[]'::jsonb,'ReasonAI Supabase structural auditor',
       'postgres-structural-20261016-v2',
       case when ok then null else 'STRUCTURAL_CASE_SET_INCOMPLETE' end
from numbered;