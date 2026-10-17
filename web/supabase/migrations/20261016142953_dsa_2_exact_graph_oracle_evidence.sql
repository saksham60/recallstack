-- Independent exact graph oracles for spanning-tree count (Kirchhoff/Bareiss)
-- and Chinese Postman (Floyd shortest paths + odd-vertex matching).
-- Both latest suites matched 55/55 expected outputs. Evidence only.
do $$
declare x record; n int; fp text; pub int; hid int; rej int; attempt int; done int:=0;
begin
for x in select * from (values
(314,'f7ac995c-4265-4625-ab57-5ea9927d8de6'::uuid,'973ace0d-fce7-4757-a783-c687e8e110d3'::uuid,24,'242e2c82a5f2fba448525bf4a8df9325'),
(319,'5ea26e78-1b00-45d3-be53-327cba7a731e'::uuid,'8d0c07f1-b9a7-4744-a334-f2d02915399f'::uuid,31,'1bd423e189fdcee47e5b35832815b06f')
) z(problem_number,version_id,suite_id,expected_count,expected_hash)
loop
if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2) or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id then raise exception 'Unexpected suite %',x.problem_number;end if;
select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected') into n,fp,pub,hid,rej from public.dsa_test_cases where suite_id=x.suite_id;
if n<>x.expected_count or fp<>x.expected_hash or pub=0 or hid=0 or rej>0 then raise exception 'Fixture changed %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.suite_id=x.suite_id and c.problem_version_id=x.version_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-exact-graph-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks where problem_version_id=x.version_id and suite_id=x.suite_id and check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('method',case when x.problem_number=314 then 'kirchhoff_bareiss_exact_integer' else 'floyd_plus_minimum_odd_vertex_matching' end,'problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_hash,'scope','fixture_outputs_only','hosted_judge_verified',false),'[]'::jsonb,'ReasonAI independent graph oracle','independent-js-exact-graph-20261016-v1',null);
end if;
done:=done+1;
end loop;
if done<>2 then raise exception 'Expected two graph oracles';end if;
end $$;
