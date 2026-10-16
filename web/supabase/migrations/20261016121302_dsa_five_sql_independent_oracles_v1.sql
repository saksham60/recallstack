-- Independent SQL oracles: 5 untrusted reference solutions are NOT executed in database.
-- Compare each expected JSON with a separate pure SQL algorithm; log result only.
-- This does not certify source/provider equivalence, Python harness or sandbox.
with picked as (
 select i.slug,v.id problem_version_id,
  (select s.id from public.dsa_test_suites s where s.problem_version_id=v.id order by s.suite_version desc limit 1) suite_id
 from public.dsa_problem_versions v
 join public.dsa_problem_definitions d on d.id=v.definition_id
 join public.content_items i on i.id=d.content_item_id
 where v.version_number=2 and i.slug in ('ultimate-dsa-004-contains-duplicate','ultimate-dsa-008-best-time-to-buy-and-sell-stock','ultimate-dsa-017-container-with-most-water','ultimate-dsa-030-valid-anagram','ultimate-dsa-040-palindromic-substrings')
), checked as (
 select p.slug,p.problem_version_id,p.suite_id,t.id,t.expected_json,
  case when p.slug='ultimate-dsa-004-contains-duplicate' then to_jsonb((select count(*)>count(distinct n.val) from jsonb_array_elements(t.input_json->'nums') n(val)))
  when p.slug='ultimate-dsa-008-best-time-to-buy-and-sell-stock' then to_jsonb((select coalesce(max(price-running_min),0)::integer from (select x.val::int price,min(x.val::int) over(order by x.idx) running_min from jsonb_array_elements_text(t.input_json->'prices') with ordinality x(val,idx)) z))
  when p.slug='ultimate-dsa-017-container-with-most-water' then to_jsonb((select coalesce(max(least(a.val::integer,b.val::integer)*(b.idx-a.idx)),0)::integer from jsonb_array_elements_text(t.input_json->'heights') with ordinality a(val,idx) cross join jsonb_array_elements_text(t.input_json->'heights') with ordinality b(val,idx) where a.idx<b.idx))
  when p.slug='ultimate-dsa-030-valid-anagram' then to_jsonb((select array_agg(a.x order by a.x) from unnest(regexp_split_to_array(t.input_json->>'first','')) a(x)) is not distinct from (select array_agg(b.x order by b.x) from unnest(regexp_split_to_array(t.input_json->>'second','')) b(x)))
  when p.slug='ultimate-dsa-040-palindromic-substrings' then to_jsonb((select count(*)::integer from generate_series(1,char_length(t.input_json->>'text')) pos cross join lateral generate_series(1,char_length(t.input_json->>'text')-pos+1) as len where substring(t.input_json->>'text' from pos for len)=reverse(substring(t.input_json->>'text' from pos for len))))
  else null::jsonb end oracle
 from picked p join public.dsa_test_cases t on t.suite_id=p.suite_id
), audited as (
 select slug,problem_version_id,suite_id,count(*)::int n,
    count(*) filter(where oracle=expected_json)::int matches
 from checked group by slug,problem_version_id,suite_id
), numbered as (
 select a.*,
   coalesce((select max(c.attempt_number) from dsa_execution_private.certification_checks c
   where c.problem_version_id=a.problem_version_id and c.suite_id=a.suite_id
     and c.check_name='independent_oracle'),0)+1 attempt
 from audited a where a.n=a.matches and a.n>=20
   and not exists(select 1 from dsa_execution_private.certification_checks c
    where c.problem_version_id=a.problem_version_id and c.suite_id=a.suite_id
      and c.check_name='independent_oracle'
      and c.verifier_version='postgres-independent-sql-20261016-v1')
)
insert into dsa_execution_private.certification_checks
(problem_version_id,suite_id,check_name,attempt_number,result,evidence,
source_references,verifier,verifier_version,failure_code)
select problem_version_id,suite_id,'independent_oracle',attempt,'passed',
 jsonb_build_object('method','independent_pure_sql_oracle',
 'slug',slug,'expected_cases',n,'matched_cases',matches,
 'source_contract_verified',false,'python_harness_verified',false,
 'hosted_provider_verified',false,'certificate_issued',false),
 '[]'::jsonb,'ReasonAI SQL independent oracle checker',
 'postgres-independent-sql-20261016-v1',null
from numbered;