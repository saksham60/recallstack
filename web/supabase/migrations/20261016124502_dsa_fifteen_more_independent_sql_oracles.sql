-- Direct Supabase independent SQL oracle recheck for 15 DSA problem versions.
-- Only writes certification_check evidence; does NOT promote pending test rows,
-- approve suites, grant submit certificates or expose hidden case contents.
-- Each oracle is a separate SQL algorithm, not the imported Python reference.
with latest as (
 select distinct on(problem_version_id) problem_version_id,id suite_id,status
 from public.dsa_test_suites order by problem_version_id,suite_version desc,created_at desc
), picked as (
 select i.slug,v.id problem_version_id,l.suite_id
 from public.dsa_problem_versions v
 join public.dsa_problem_definitions d on d.id=v.definition_id
 join public.content_items i on i.id=d.content_item_id
 join latest l on l.problem_version_id=v.id
 where v.version_number=2 and l.status='needs_review'
   and i.slug in ('ultimate-dsa-002-reverse-the-array','ultimate-dsa-010-kth-largest-element-in-an-array','ultimate-dsa-011-trapping-rain-water','ultimate-dsa-014-find-minimum-in-rotated-sorted-array','ultimate-dsa-018-given-sum-pair','ultimate-dsa-019-kth-smallest-element','ultimate-dsa-023-space-optimization-using-bit-manipulations','ultimate-dsa-024-subarray-sum-divisible-k','ultimate-dsa-029-valid-palindrome','ultimate-dsa-032-remove-consecutive-characters','ultimate-dsa-034-convert-a-sentence-into-its-equivalent-mobile-numeric-keypad-sequence','ultimate-dsa-036-longest-substring-without-repeating-characters','ultimate-dsa-045-longest-prefix-suffix','ultimate-dsa-046-rabin-karp-algorithm-for-pattern-searching','ultimate-dsa-049-boyer-moore-algorithm-for-pattern-searching')
), checked as (
 select p.slug,p.problem_version_id,p.suite_id,t.expected_json,
 case
   when p.slug='ultimate-dsa-002-reverse-the-array' then coalesce((select jsonb_agg(a.val order by a.ord desc) from jsonb_array_elements(t.input_json->'nums') with ordinality a(val,ord)),'[]'::jsonb)
  when p.slug='ultimate-dsa-010-kth-largest-element-in-an-array' then coalesce((select to_jsonb(z.val::bigint) from (select x.val,row_number() over(order by x.val::bigint desc,x.ord asc) rank from jsonb_array_elements_text(t.input_json->'nums') with ordinality x(val,ord)) z where z.rank=(t.input_json->>'k')::int),'null'::jsonb)
  when p.slug='ultimate-dsa-011-trapping-rain-water' then to_jsonb((select coalesce(sum(greatest(least((select max(b.val::bigint) from jsonb_array_elements_text(t.input_json->'heights') with ordinality b(val,idx) where b.idx<=a.idx),(select max(c.val::bigint) from jsonb_array_elements_text(t.input_json->'heights') with ordinality c(val,idx) where c.idx>=a.idx))-a.val::bigint,0)),0)::bigint from jsonb_array_elements_text(t.input_json->'heights') with ordinality a(val,idx)))
  when p.slug='ultimate-dsa-014-find-minimum-in-rotated-sorted-array' then coalesce((select to_jsonb(min(x.val::bigint)) from jsonb_array_elements_text(t.input_json->'array') x(val)),'null'::jsonb)
  when p.slug='ultimate-dsa-018-given-sum-pair' then to_jsonb(exists(select 1 from jsonb_array_elements_text(t.input_json->'values') with ordinality a(val,idx) join jsonb_array_elements_text(t.input_json->'values') with ordinality b(val,idx) on a.idx<b.idx where a.val::bigint+b.val::bigint=(t.input_json->>'target')::bigint))
  when p.slug='ultimate-dsa-019-kth-smallest-element' then coalesce((select to_jsonb(z.val::bigint) from (select x.val,row_number() over(order by x.val::bigint asc,x.ord asc) rank from jsonb_array_elements_text(t.input_json->'array') with ordinality x(val,ord)) z where z.rank=(t.input_json->>'k')::int),'null'::jsonb)
  when p.slug='ultimate-dsa-023-space-optimization-using-bit-manipulations' then coalesce((select jsonb_agg(n order by n) from generate_series((t.input_json->>'low')::int,(t.input_json->>'high')::int) n where n%2=0 or n%5=0),'[]'::jsonb)
  when p.slug='ultimate-dsa-024-subarray-sum-divisible-k' then to_jsonb((select coalesce(max(b.idx-a.idx+1),0)::int from jsonb_array_elements_text(t.input_json->'nums') with ordinality a(val,idx) join jsonb_array_elements_text(t.input_json->'nums') with ordinality b(val,idx) on a.idx<=b.idx where (select sum(c.val::bigint) from jsonb_array_elements_text(t.input_json->'nums') with ordinality c(val,idx) where c.idx between a.idx and b.idx)%(t.input_json->>'k')::bigint=0))
  when p.slug='ultimate-dsa-029-valid-palindrome' then to_jsonb(lower(regexp_replace(t.input_json->>'text','[^a-zA-Z0-9]','','g'))=reverse(lower(regexp_replace(t.input_json->>'text','[^a-zA-Z0-9]','','g'))))
  when p.slug='ultimate-dsa-032-remove-consecutive-characters' then to_jsonb(coalesce((select string_agg(substring(t.input_json->>'text' from a.idx for 1),'' order by a.idx) from generate_series(1,char_length(t.input_json->>'text')) a(idx) where a.idx=1 or substring(t.input_json->>'text' from a.idx for 1)<>substring(t.input_json->>'text' from a.idx-1 for 1)),''))
  when p.slug='ultimate-dsa-034-convert-a-sentence-into-its-equivalent-mobile-numeric-keypad-sequence' then to_jsonb(coalesce((select string_agg(case when x.ch=' ' then '0' else (array['2','22','222','3','33','333','4','44','444','5','55','555','6','66','666','7','77','777','7777','8','88','888','9','99','999','9999'])[ascii(x.ch)-64] end,'' order by x.idx) from (select substring(t.input_json->>'text' from a.idx for 1) ch,a.idx from generate_series(1,char_length(t.input_json->>'text')) a(idx)) x),''))
  when p.slug='ultimate-dsa-036-longest-substring-without-repeating-characters' then to_jsonb((select coalesce(max(b.j-a.i+1),0)::int from generate_series(1,char_length(t.input_json->>'s')) a(i) cross join lateral generate_series(a.i,char_length(t.input_json->>'s')) b(j) where (select count(distinct x.ch) from regexp_split_to_table(substring(t.input_json->>'s' from a.i for b.j-a.i+1),'') x(ch))=b.j-a.i+1))
  when p.slug='ultimate-dsa-045-longest-prefix-suffix' then to_jsonb((select coalesce(max(g.l),0)::int from generate_series(1,char_length(t.input_json->>'s')-1) g(l) where left(t.input_json->>'s',g.l)=right(t.input_json->>'s',g.l)))
  when p.slug='ultimate-dsa-046-rabin-karp-algorithm-for-pattern-searching' then coalesce((select jsonb_agg(z.idx order by z.idx) from generate_series(0,char_length(t.input_json->>'text')-char_length(t.input_json->>'pattern')) z(idx) where substring(t.input_json->>'text' from z.idx+1 for char_length(t.input_json->>'pattern'))=t.input_json->>'pattern'),'[]'::jsonb)
  when p.slug='ultimate-dsa-049-boyer-moore-algorithm-for-pattern-searching' then coalesce((select jsonb_agg(z.idx order by z.idx) from generate_series(0,char_length(t.input_json->>'text')-char_length(t.input_json->>'pattern')) z(idx) where substring(t.input_json->>'text' from z.idx+1 for char_length(t.input_json->>'pattern'))=t.input_json->>'pattern'),'[]'::jsonb)
 else null::jsonb end oracle
 from picked p join public.dsa_test_cases t on t.suite_id=p.suite_id
), audited as (
 select slug,problem_version_id,suite_id,count(*)::int case_count,
        count(*) filter(where expected_json=oracle)::int matched,
        count(*) filter(where expected_json is distinct from oracle)::int mismatched
 from checked group by slug,problem_version_id,suite_id
), numbered as (
 select a.*,
 coalesce((select max(c.attempt_number)
   from dsa_execution_private.certification_checks c
   where c.problem_version_id=a.problem_version_id and c.suite_id=a.suite_id
     and c.check_name='independent_oracle'),0)+1 attempt
 from audited a
 where a.case_count>=20
 and not exists(select 1 from dsa_execution_private.certification_checks c
     where c.problem_version_id=a.problem_version_id and c.suite_id=a.suite_id
       and c.check_name='independent_oracle'
       and c.verifier_version='postgres-independent-sql-20261016-v2')
)
insert into dsa_execution_private.certification_checks (
 problem_version_id,suite_id,check_name,attempt_number,result,evidence,
 source_references,verifier,verifier_version,failure_code
)
select problem_version_id,suite_id,'independent_oracle',attempt,
       case when mismatched=0 then 'passed' else 'failed' end,
       jsonb_build_object('slug',slug,'method','independent_pure_sql_oracle',
         'cases_checked',case_count,'cases_matched',matched,'cases_mismatched',mismatched,
         'source_contract_verified',false,'python_harness_verified',false,
         'provider_verified',false,'official_certificate_issued',false),
       '[]'::jsonb,
       'ReasonAI independent SQL oracle audit',
       'postgres-independent-sql-20261016-v2',
       case when mismatched=0 then null else 'INDEPENDENT_ORACLE_MISMATCH' end
from numbered;