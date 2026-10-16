-- Independent SQL oracle checks for eight more problem versions.
-- Explicit C collation for Python Unicode codepoint compatible sorting.
-- Only audit evidence is recorded; no fixture status or judge certificate is changed.
with latest as (
 select distinct on(problem_version_id) problem_version_id,id suite_id,status
 from public.dsa_test_suites
 order by problem_version_id,suite_version desc,created_at desc
), picked as (
 select i.slug,v.id problem_version_id,l.suite_id
 from public.dsa_problem_versions v
 join public.dsa_problem_definitions d on d.id=v.definition_id
 join public.content_items i on i.id=d.content_item_id
 join latest l on l.problem_version_id=v.id
 where v.version_number=2 and l.status='needs_review'
 and i.slug in ('ultimate-dsa-006-search-an-element-in-a-sorted-and-pivoted-array','ultimate-dsa-009-repeat-and-missing-number-array','ultimate-dsa-015-search-in-rotated-sorted-array','ultimate-dsa-035-print-all-the-duplicates-in-the-input-string','ultimate-dsa-038-group-anagrams','ultimate-dsa-054-set-matrix-zeroes','ultimate-dsa-056-rotate-image','ultimate-dsa-076-find-duplicates-in-o-n-time-and-o-1-extra-space')
), checked as (
 select p.slug,p.problem_version_id,p.suite_id,t.expected_json,
 case
 when p.slug='ultimate-dsa-006-search-an-element-in-a-sorted-and-pivoted-array' then to_jsonb(coalesce((select min((a.idx-1)::int) from jsonb_array_elements_text(t.input_json->'nums') with ordinality a(val,idx) where a.val::bigint=(t.input_json->>'target')::bigint),-1))
 when p.slug='ultimate-dsa-009-repeat-and-missing-number-array' then jsonb_build_array((select a.val::int from jsonb_array_elements_text(t.input_json->'array') a(val) group by a.val having count(*)=2 limit 1),(select n from generate_series(1,jsonb_array_length(t.input_json->'array')) n where not exists(select 1 from jsonb_array_elements_text(t.input_json->'array') a(val) where a.val::int=n) limit 1))
 when p.slug='ultimate-dsa-015-search-in-rotated-sorted-array' then to_jsonb(coalesce((select min((a.idx-1)::int) from jsonb_array_elements_text(t.input_json->'nums') with ordinality a(val,idx) where a.val::bigint=(t.input_json->>'target')::bigint),-1))
 when p.slug='ultimate-dsa-035-print-all-the-duplicates-in-the-input-string' then coalesce((select jsonb_agg(jsonb_build_object('char',z.ch,'count',z.cnt) order by z.ch collate "C") from (select substring(t.input_json->>'text' from s.idx for 1) ch,count(*)::int cnt from generate_series(1,char_length(t.input_json->>'text')) s(idx) group by 1 having count(*)>1) z),'[]'::jsonb)
 when p.slug='ultimate-dsa-038-group-anagrams' then coalesce((select jsonb_agg(g.words order by g.first_word collate "C") from (select jsonb_agg(x.word order by x.word collate "C") words,min(x.word) first_word from (select w.val word,(select string_agg(c.ch,'' order by c.ch collate "C") from regexp_split_to_table(w.val,'') c(ch)) signature from jsonb_array_elements_text(t.input_json->'words') w(val)) x group by x.signature) g),'[]'::jsonb)
 when p.slug='ultimate-dsa-054-set-matrix-zeroes' then coalesce((select jsonb_agg((select coalesce(jsonb_agg(case when exists(select 1 from jsonb_array_elements(r.rowval) q(v) where q.v='0'::jsonb) or exists(select 1 from jsonb_array_elements(t.input_json->'matrix') rr(rowval) join jsonb_array_elements(rr.rowval) with ordinality cc(val,j) on cc.j=c.colindex where cc.val='0'::jsonb) then '0'::jsonb else c.val end order by c.colindex),'[]'::jsonb) from jsonb_array_elements(r.rowval) with ordinality c(val,colindex)) order by r.rowindex) from jsonb_array_elements(t.input_json->'matrix') with ordinality r(rowval,rowindex)),'[]'::jsonb)
 when p.slug='ultimate-dsa-056-rotate-image' then coalesce((select jsonb_agg((select jsonb_agg((t.input_json->'matrix'-> (jsonb_array_length(t.input_json->'matrix')-1-col.c))->row.r order by col.c) from generate_series(0,jsonb_array_length(t.input_json->'matrix')-1) col(c)) order by row.r) from generate_series(0,jsonb_array_length(t.input_json->'matrix')-1) row(r)),'[]'::jsonb)
 when p.slug='ultimate-dsa-076-find-duplicates-in-o-n-time-and-o-1-extra-space' then coalesce((select jsonb_agg(z.val order by z.val) from (select x.val::int val from jsonb_array_elements_text(t.input_json->'nums') x(val) group by x.val having count(*)>1) z),'[]'::jsonb)
 else null::jsonb end oracle
 from picked p join public.dsa_test_cases t on t.suite_id=p.suite_id
), audited as (
 select slug,problem_version_id,suite_id,count(*)::int n,
 count(*) filter(where expected_json=oracle)::int matches,
 count(*) filter(where expected_json is distinct from oracle)::int mismatches
 from checked group by slug,problem_version_id,suite_id
), numbered as (
 select a.*,coalesce((select max(c.attempt_number)
 from dsa_execution_private.certification_checks c
 where c.problem_version_id=a.problem_version_id and c.suite_id=a.suite_id
 and c.check_name='independent_oracle'),0)+1 attempt
 from audited a where a.n>=20
 and not exists(select 1 from dsa_execution_private.certification_checks c
 where c.problem_version_id=a.problem_version_id and c.suite_id=a.suite_id
 and c.check_name='independent_oracle'
 and c.verifier_version='postgres-independent-sql-20261016-v3')
)
insert into dsa_execution_private.certification_checks
(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,
verifier,verifier_version,failure_code)
select problem_version_id,suite_id,'independent_oracle',attempt,
 case when mismatches=0 then 'passed' else 'failed' end,
 jsonb_build_object('slug',slug,'method','independent_sql_reference',
 'cases_checked',n,'matched',matches,'mismatched',mismatches,
 'unicode_sort','C_collation_explicit',
 'python_harness_checked',false,'provider_execution_checked',false,
 'source_contract_verified',false,'trusted_certificate_issued',false),
 '[]'::jsonb,'ReasonAI independent SQL oracle verifier',
 'postgres-independent-sql-20261016-v3',
 case when mismatches=0 then null else 'INDEPENDENT_ORACLE_MISMATCH' end
from numbered;