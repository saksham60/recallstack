-- Five DSA tree fixtures independently verified under per-problem heap-index contracts.
-- Unlike compact BFS codec, node at array index i has children 2*i+1 and 2*i+2.
-- Version-2 constraints and Python reference solutions both specify heap indexing.
-- 155/155 expected outputs verified using independent JS algorithms.
do $$
declare x record; n int; hash_now text; pub int; hid int; rejected int; attempt int; processed int:=0;
begin
for x in select * from (values
(196,'e32bdf5f-0982-48b2-a72f-8dab49790ca3'::uuid,'eb7a3bd4-f04d-44a1-852c-f4dd8da53fd6'::uuid,32,'323f374f02570d9fa6915fb3efe8f002'),
(212,'ea8c1b24-9fbc-4b6a-8d85-37790718ac79'::uuid,'99c51df7-c7e7-4074-8d3d-97bfb4565d71'::uuid,32,'c82be930ab47f7d119cf9e508d9c981a'),
(213,'bc202bc0-5587-4fa0-a3aa-802c44496b81'::uuid,'a5f65aa1-6550-45ff-9c8f-2c5a09234fba'::uuid,31,'5843d5b5742a8f9586003661d1c8a6e6'),
(223,'c0455deb-a4b8-4ccf-ae75-b8ed7e277124'::uuid,'33e575d7-ce7c-4bed-8af8-7016a4173383'::uuid,28,'2efda9099697cfd6b58533200765275a'),
(226,'6b6fba4d-5811-48ee-9c31-92ecc8f0c091'::uuid,'7e72f7e2-2992-4b87-a522-7f3f383d2d30'::uuid,32,'2e07d7c02ea810081a16e9c5f5ceb23f')
) as v(problem_number,version_id,suite_id,expected_count,expected_hash)
loop
if not exists (select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id
then raise exception 'Stale suite %',x.problem_number;end if;
select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected') into n,hash_now,pub,hid,rejected from public.dsa_test_cases where suite_id=x.suite_id;
if n<>x.expected_count or hash_now<>x.expected_hash or pub=0 or hid=0 or rejected>0 then raise exception 'Snapshot mismatch %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-heap-tree-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks where problem_version_id=x.version_id and suite_id=x.suite_id and check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values (x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('method','independent_js_heap_tree_oracle','problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_hash,'tree_codec','complete_heap_index_array','contract_encoding_confirmed',true,'hosted_judge_verified',false),'[]'::jsonb,'ReasonAI independent tree oracle','independent-js-heap-tree-20261016-v1',null);
end if;
processed:=processed+1;
end loop;
if processed<>5 then raise exception 'Expected 5';end if;
end $$;
