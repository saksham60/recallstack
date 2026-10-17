-- Independent JS tree oracle results: 18 tree problem versions / 567 fixtures.
-- Verify exact latest suite/fixture digests; write private oracle evidence only.
-- Subtree of Another Tree, Bottom View, Diagonal Traversal excluded pending investigation.
do $$
declare x record; n int; hash_now text; pc int; hc int; rejects int; attempt int; processed int:=0;
begin
for x in select * from (values
(194,'29f6cdd2-aac3-402b-ac56-bed13e785456'::uuid,'27fa0b86-813d-43c4-b676-6701e66b04a6'::uuid,30,'4cf0653638a87ea00dee564dc52ce39c'),
(195,'85beb171-30a0-4410-a80e-034f60d5c29f'::uuid,'92511131-c29b-4126-b23c-bab634ec0eee'::uuid,32,'1160fcfa0c45b7c679f5b4e603fac05c'),
(197,'28e8691a-25a0-499f-a406-8f27aead9880'::uuid,'9850f0b6-5e18-4125-b534-449a054059d7'::uuid,32,'afd80ae8f109e96104b04455fa0e0b3b'),
(198,'6f101534-0634-418e-92a1-09e5b32c6812'::uuid,'1d91335b-532f-4b16-ba16-484dd26bbf7f'::uuid,31,'d3c191bc646e03077ebb4a383478a207'),
(199,'5f06ec9b-ad27-41bf-8ed6-b5063b589f17'::uuid,'bf3d1975-08b2-47cc-8723-28d7c918558e'::uuid,32,'768be646b6d9940f543a1538afcd5a9f'),
(200,'e9f9c45a-de3c-4269-9dd8-968a252d46b8'::uuid,'427e79e4-9322-4aab-be65-611982be42be'::uuid,32,'c0974d7852907473fc2abe202a96001d'),
(201,'75adef41-7a47-4381-8cd5-b37eb2aee80a'::uuid,'1ba2156c-9af0-4020-a836-57826ce202be'::uuid,31,'c3776707533bfebc41a8c871af2accfb'),
(202,'10ca6274-01ef-464f-9bfc-a1613fffe120'::uuid,'28aade00-ee7e-4edf-97da-9e434c8dfcc2'::uuid,32,'f2bd7194007f573072a56aee1f748b72'),
(203,'2b152fc1-5204-488c-a15e-8ea8ef449f8d'::uuid,'cf792597-92a3-4f38-81c9-df9b6ae48bff'::uuid,29,'48761629344c7366b351fd30f82abe93'),
(204,'fc9bf8cd-48a2-4ca8-9f6e-68a081eae0f1'::uuid,'2b05b8a2-2fc6-4305-8728-b766ffbe62ba'::uuid,32,'ea915f0ca56591a2028eb985b88f462d'),
(205,'f291829c-5328-4277-9a04-988e2821c7e4'::uuid,'98ce0132-90bb-4631-a747-639dd71f3875'::uuid,32,'cd17e9b38c9027334eb3293a0691f227'),
(206,'61b27b62-310d-418a-9ce2-b78aa3e222ac'::uuid,'79a276a4-4407-42b7-8ee2-bed28ea07444'::uuid,32,'a764e9d375300829f5c9239fe0f6da0d'),
(207,'9aaab387-ef31-4f71-b0f1-3e4be7f4e1b5'::uuid,'4cf2bd87-ce0f-4e50-9e85-b4bd56b434f7'::uuid,32,'3a2701b458d4b050036eaf4e11e36418'),
(208,'a7344ed8-c48e-4ddd-b50a-af59b2ba6197'::uuid,'867c382b-51f4-4790-9ef4-dff75623bbf6'::uuid,32,'1f948ecd100ec74a0879eb388e2f9ea0'),
(209,'a8426435-5442-42c2-9dd3-37d0f9fdf09f'::uuid,'68008fe9-f088-481a-b5d3-98dafa20caeb'::uuid,32,'08ea83c3abe578b07871695cf4cebd07'),
(210,'420ef45e-2fbd-44d7-91a0-92f31b600ebf'::uuid,'0e7c0601-de05-4900-b2cd-99ac8a9f32ac'::uuid,32,'c7162e51dedafaea88d977ca053e0687'),
(211,'e4ebb70a-625e-4df4-b5f0-f09990a2d835'::uuid,'f6038b80-bf3f-444d-aed6-db50e2cccc3a'::uuid,32,'ca57fcc4ff37c1551fe7a0139b230da5'),
(214,'8300d254-682b-47fd-8356-0eeaa2c9da39'::uuid,'365745e0-fc9f-420a-a724-2976f943ea14'::uuid,30,'d87227bcd79795693259e5b50c57aa0c')
) v(problem_number,version_id,suite_id,expected_cases,expected_hash)
loop
if not exists (select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id
then raise exception 'Stale version or suite %',x.problem_number;end if;
select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),count(*) filter(where t.visibility='public'),count(*) filter(where t.visibility='hidden'),count(*) filter(where t.validation_status='rejected') into n,hash_now,pc,hc,rejects from public.dsa_test_cases t where t.suite_id=x.suite_id;
if n<>x.expected_cases or hash_now<>x.expected_hash or pc=0 or hc=0 or rejects>0 then raise exception 'Fixture changed %',x.problem_number;end if;
if not exists (select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-tree-core-20261016-v2') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks where problem_version_id=x.version_id and suite_id=x.suite_id and check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('problem_number',x.problem_number,'cases_checked',x.expected_cases,'cases_matched',x.expected_cases,'fixture_snapshot_md5',x.expected_hash,'method','independent_js_tree_oracle','tree_codec','problem_specific','scope','fixture_outputs_only','hosted_judge_checked',false,'adapter_contract_checked',false),'[]'::jsonb,'ReasonAI independent tree oracle','independent-js-tree-core-20261016-v2',null);
end if;
processed:=processed+1;
end loop;
if processed<>18 then raise exception 'Expected 18 tree checks';end if;
end $$;
