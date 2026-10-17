-- BigInt integrity audit, append immutable blocked evidence for 8 latest suites.
do $audit$
declare x record; c int; h text; attempt int; count_done int:=0;
begin
for x in
select v.problem_number,v.expected_count,v.expected_hash,v.mismatches,p.id as problem_version_id,s.id as suite_id
from (values
(12,32,'ac5526c441bd35d793024d79ced44a12',4),
(78,31,'f5b6362fa89e4a9c667041102f170235',2),
(336,28,'f9c7cdcc0119a8bf88c4e0f4f7f50a57',4),
(337,30,'7d5605a8a1591eefb7af72e51a16e742',8),
(353,32,'cda30f2cd2da10d748c9737df0dd6569',6),
(388,31,'ce025c27e23f0948a0579937d9506d95',5),
(390,30,'b1403aeddfecc1f3756b39be55c4acfc',2),
(391,32,'563fe211d89d97fdb8306ec1d70ab67a',3)
) v(problem_number,expected_count,expected_hash,mismatches)
join public.content_items i on substring(i.slug from '^ultimate-dsa-([0-9]+)-')::int=v.problem_number
join public.dsa_problem_definitions d on d.content_item_id=i.id
join public.dsa_problem_versions p on p.definition_id=d.id and p.version_number=2
join public.dsa_test_suites s on s.problem_version_id=p.id and s.id=(select ss.id from public.dsa_test_suites ss where ss.problem_version_id=p.id order by ss.suite_version desc,ss.created_at desc limit 1)
loop
select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)) into c,h from public.dsa_test_cases t where t.suite_id=x.suite_id;
if c<>x.expected_count or h<>x.expected_hash then raise exception 'Fixture snapshot changed for %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.problem_version_id and c.suite_id=x.suite_id and c.check_name='fixture_integrity' and c.verifier_version='exact-bigint-cross-catalog-20261016-v2') then
 select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks where problem_version_id=x.problem_version_id and suite_id=x.suite_id and check_name='fixture_integrity';
 insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
 values(x.problem_version_id,x.suite_id,'fixture_integrity',attempt,'blocked',jsonb_build_object('problem_number',x.problem_number,'fixture_snapshot_md5',x.expected_hash,'cases_checked',x.expected_count,'mathematical_mismatches',x.mismatches,'reason','lossy_integer_import','requires_versioned_fixture_repair',true,'prior_js_oracle_pass_not_sufficient',true,'judge_runtime_safe_large_integers',false),'[]'::jsonb,'ReasonAI exact BigInt independent audit','exact-bigint-cross-catalog-20261016-v2','LOSSY_INTEGER_FIXTURES');
end if;
count_done:=count_done+1;
end loop;
if count_done<>8 then raise exception 'Expected 8, got %',count_done;end if;
end $audit$;
