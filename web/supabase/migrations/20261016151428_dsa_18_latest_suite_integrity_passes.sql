-- Finish latest-suite fixture-integrity evidence for 18 previously unchecked suites.
-- Verify unique inputs, public/hidden partition, non-rejected cases, and latest suite identity.
-- This is database integrity, NOT provider E2E certification or publication.
do $$
declare p record; n int; uniques int; pubs int; hiddens int; rejected int; digest text; attempt int; processed int:=0;
begin
for p in with latest as(select distinct on(s.problem_version_id) s.id suite_id,s.problem_version_id from public.dsa_test_suites s join public.dsa_problem_versions v on v.id=s.problem_version_id and v.version_number=2 order by s.problem_version_id,s.suite_version desc,s.created_at desc)
select substring(i.slug from '^ultimate-dsa-([0-9]+)-')::int n,l.suite_id,l.problem_version_id
from latest l join public.dsa_problem_versions v on v.id=l.problem_version_id
join public.dsa_problem_definitions d on d.id=v.definition_id join public.content_items i on i.id=d.content_item_id
where substring(i.slug from '^ultimate-dsa-([0-9]+)-')::int in (1,3,5,12,33,66,67,69,78,115,173,336,337,353,388,390,391,392)
loop
select count(*),count(distinct input_json),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),
count(*) filter(where validation_status='rejected'),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal))
into n,uniques,pubs,hiddens,rejected,digest from public.dsa_test_cases where suite_id=p.suite_id;
if n<8 or n<>uniques or pubs<1 or hiddens<1 or rejected>0 or pubs+hiddens<>n then raise exception 'Invalid latest fixtures for problem %',p.n;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=p.problem_version_id and c.suite_id=p.suite_id and c.check_name='fixture_integrity' and c.verifier_version='latest-fixture-integrity-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks where problem_version_id=p.problem_version_id and suite_id=p.suite_id and check_name='fixture_integrity';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(p.problem_version_id,p.suite_id,'fixture_integrity',attempt,'passed',
jsonb_build_object('problem_number',p.n,'cases',n,'distinct_inputs',uniques,'public_cases',pubs,'hidden_cases',hiddens,'rejected_cases',rejected,'snapshot_md5',digest,'scope','latest_suite_database_fixture_integrity','hosted_judge_certified',false),
'[]'::jsonb,'ReasonAI Supabase fixture integrity audit','latest-fixture-integrity-20261016-v1',null);
end if;
processed:=processed+1;
end loop;
if processed<>18 then raise exception 'Expected 18 integrity audits but got %',processed;end if;
end $$;
