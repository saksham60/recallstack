-- Independent deterministic DSA dynamic-programming output oracles: 37 problems / 1145 cases.
-- Evidence scoped to immutable latest V2 fixture snapshots. Not hosted judge certification.
do $a$
declare r record; actual_n int; actual_digest text; p int; h int; rej int; attempt int; processed int:=0;
begin
for r in select * from (values
(332,'ecce719f-5412-46cb-9dec-0b613f07f189'::uuid,'2f641173-1c21-43b3-bae3-9e8f8b3e5a5c'::uuid,32,'68f7d2a84924f769e30760cd3d57a460'),
(334,'868027cf-5a9c-4fa2-b3a1-747b04581b8b'::uuid,'1fa725d9-5ec9-4162-8089-70e39a741b04'::uuid,28,'a9de28293edde09f07cab1f287bed397'),
(335,'162772a8-5a40-41f3-8e32-1088904879a6'::uuid,'968ddead-7c6c-4eb8-91b6-4613821e92d8'::uuid,32,'0e1bb63e2e5997b0cfc05c61bd82e20b'),
(338,'41eb15e0-c27e-4fdd-afa2-f833df89f4ea'::uuid,'bf64b8b6-cf6f-429a-b1ce-0871a5936632'::uuid,31,'30aedd5768ecacd5e1c2cc7b9848d238'),
(340,'a6947b26-d6fc-4d8b-b728-bec74341f288'::uuid,'7125228b-769e-4d40-8d56-84d937382e1b'::uuid,31,'57b186874afcafd6c873c81e477b3790'),
(341,'2ef19fdb-9900-41ad-bb8c-7b65270d1519'::uuid,'00bddca8-dbee-44d3-af8a-c4c22421c253'::uuid,32,'15d2f5bc181921c1a310dd879cc00511'),
(342,'7c8f5c7b-9f40-454c-99c5-8173842acd7e'::uuid,'6245db65-b81f-4cf1-ba2b-b71c69689f14'::uuid,32,'4d58b6e19c76aa7795601c73e4df0000'),
(343,'745f9b90-6537-4efc-bf59-3cac1d953869'::uuid,'c2811efc-f1d2-454b-a0bf-eda2d39ccb45'::uuid,31,'f3c9563a383c6ffa292d7a6289355389'),
(344,'d20769d1-fdec-46c6-8c4b-acbd78860375'::uuid,'510bdf1e-d614-4d3f-9530-14837ec9a495'::uuid,32,'11f3d8fb12679c219fd0b51a185603d1'),
(345,'3ce37c76-b3f5-4513-9051-b7f78b013473'::uuid,'867fca3f-e746-4025-91ba-d49672546d2f'::uuid,32,'66d128bf8cbe1c8eaf42de691c27368c'),
(346,'9c67e316-d579-466c-8f82-efef71c1a5a4'::uuid,'bf46f112-aa18-429c-8f45-2d1d1115041d'::uuid,32,'473effe687eb5610366c1b91b2eaf128'),
(347,'ed0f27c5-72bf-4cf5-b029-d8b243477a50'::uuid,'d0392e5d-145d-42c3-b7b4-472babd4bdfe'::uuid,29,'814cb8f42b75c6357644ca6a9866df4c'),
(348,'8f32a3c2-0d61-406b-b769-ac7aebac1e9a'::uuid,'48053df6-b096-4178-a5c6-bbceeada0ef9'::uuid,30,'1dc1c53ddb16809776cefc0b0717e043'),
(349,'6edc4469-c23e-4c60-9771-0b8aeb603729'::uuid,'bbf6e010-da84-4d6a-ab86-8ebae12452d5'::uuid,32,'6e89635ad9c9615dac88d22041429180'),
(350,'dfecfd48-7ca8-45c1-8783-1298b70e772f'::uuid,'59fa9a41-d595-4f4a-ab55-db4914897b20'::uuid,31,'9a9fcf36f86007e3fb9203136a3381a9'),
(351,'8850a4b6-90ae-4445-a1c5-bb74935f7756'::uuid,'9f8bc7d0-05b0-45b4-b524-3cb3743c1fbb'::uuid,32,'58e8e259c9fa56dfc932ae853e01cd6d'),
(352,'b8dc8b77-deed-4bbf-bc80-67d94a2f7de9'::uuid,'59cd0c31-377c-4649-b0fd-dc996dbebeb8'::uuid,32,'b4cb18f2394a49b364abf4b096f62472'),
(354,'a8b594ae-2038-4d14-b062-4c47c254115b'::uuid,'4af5c14b-8c95-49fe-aac4-e23069cdfca7'::uuid,31,'17a188f7ad91240e38553a7df9789f8d'),
(355,'56b17b79-db79-4340-af7c-75cdedafc0a0'::uuid,'5d009d23-8832-4da9-bc74-16ad41ec9a4c'::uuid,32,'4543866d45e521403b3ffbeede684f63'),
(356,'5ec121d4-4fbf-482b-b7fb-aa9eb68a4b66'::uuid,'feb60664-0c13-4de2-b4ea-32d2610dc7a5'::uuid,32,'d166d5dd1e6c48019d5dfd21134a4879'),
(358,'9e40c051-7a93-40a7-ab40-69609895c02e'::uuid,'b5dba7eb-11bd-4878-b0b2-6d4364fa9589'::uuid,32,'9aa71dd5a2203d8b7505796d27121db5'),
(359,'bb914194-96a8-4fe8-80c1-a74f1bd83bfa'::uuid,'5fcb6651-5191-4771-9f5a-e6d53a5e7084'::uuid,30,'a72ed0dbe47d967e58a9ef416141951b'),
(360,'d9b2801b-38ab-47af-8222-68d724b38ea0'::uuid,'bf957d74-721d-4742-ba33-c0e6f2cdaf05'::uuid,32,'945e934259f19d384e461da8a92fe168'),
(361,'2b3dbe62-8cd4-4127-89d6-7494ea0e2411'::uuid,'8e981017-3e2e-4f2a-b568-0de441c40438'::uuid,31,'4a87f0a3581bc8dedca8bd6bc862da28'),
(363,'55b043c4-3daa-46bb-964e-2bcd727b82e2'::uuid,'6de7448d-07a6-4150-9776-c3f2b3db65d6'::uuid,29,'b19c79f99ca4b05cbe68136de750f98c'),
(364,'b3dbf2c2-cd30-496a-ae82-60c685e58fba'::uuid,'819e7594-f781-4507-babe-8cd44035029a'::uuid,26,'a8a5acf73905e6e17178b3660a84b463'),
(365,'af93f52e-1463-43d4-ab91-f37663093219'::uuid,'c275e6c8-7a19-4d2c-86ac-f30f9984d146'::uuid,31,'6f3f31e3b35de4b72a7c0dcd7fa4a6fc'),
(366,'c20b28e8-a2b4-4463-99b8-0d2c27254bd2'::uuid,'87b94d05-5915-4117-ae10-3ace49466019'::uuid,30,'c2389250ec1596423afa8f071d622091'),
(367,'7cf367b7-0bd9-4519-96bb-33af2db3950b'::uuid,'adc6f6c7-cbab-4bd7-80a0-8de693b9a797'::uuid,32,'08c0aa54c1e7a7303830c3c28e2a4f17'),
(368,'1c0906d7-cad6-404e-b378-296b97d774ef'::uuid,'dda0cb8e-76d3-4dc2-b36e-dd98d4996fcd'::uuid,32,'a2d65844e560fa9536ef6ce6d3ecb8e1'),
(369,'cb4f80af-5172-4641-829b-a3cc2799ae78'::uuid,'59c6cec0-38f1-4022-90db-e3ab013d30bf'::uuid,31,'a56599ab3aa37c3e9d82f41d013f2958'),
(370,'bfc8ddcd-9469-4032-92ef-e8e100fc6a1c'::uuid,'7d9af898-1fdc-4d90-88bc-9cd26ca3c346'::uuid,29,'7cb6c8f8d951b88a455cd4ada486ec67'),
(371,'78b3e8b1-0e74-48fc-9f15-38174b9f82a0'::uuid,'c24d1b0e-ef11-4daf-b361-edd272540f0a'::uuid,27,'3bf808b718f9b5cc3d9f3830f1c5d309'),
(372,'c5eb8208-8c81-4ef8-971f-345a334bee1c'::uuid,'dfae35f7-5600-40f3-a438-37ee939bde21'::uuid,32,'21a5ad852cbfe9533853b333feb0158d'),
(373,'b9589744-4da5-4f42-b8e9-f87e6f71d3cc'::uuid,'3de13466-4b4f-4ef1-b33c-74e1b6d84c23'::uuid,32,'a36bf12cc80182bfe9f1c475dfdeac40'),
(374,'056ccbaf-c98c-4daa-bdfc-98f2a25b45f0'::uuid,'ff7d515a-db08-4a03-a895-6638606243c4'::uuid,31,'9fac985555df8994d2a51c0c020a64ed'),
(375,'434b9ed5-45ac-4381-9961-dd2568b44905'::uuid,'47a95000-bb82-46fb-8574-43f4dc8be0a8'::uuid,32,'f936e216e116dbdab6b20024699e84e1')
) as v(problem_number,version_id,suite_id,expected_count,expected_md5)
loop
if not exists(select 1 from public.dsa_problem_versions v where v.id=r.version_id and v.version_number=2) or
(select s.id from public.dsa_test_suites s where s.problem_version_id=r.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from r.suite_id then
 raise exception 'Wrong version/suite for problem %',r.problem_number;
end if;
select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),
count(*) filter(where t.visibility='public'),count(*) filter(where t.visibility='hidden'),
count(*) filter(where t.validation_status='rejected')
into actual_n,actual_digest,p,h,rej from public.dsa_test_cases t where t.suite_id=r.suite_id;
if actual_n<>r.expected_count or actual_digest<>r.expected_md5 or p=0 or h=0 or rej<>0 then raise exception 'Fixture changed for problem %',r.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=r.version_id and c.suite_id=r.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-dp-batch10-20261016-v1') then
 select coalesce(max(c.attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks c where c.problem_version_id=r.version_id and c.suite_id=r.suite_id and c.check_name='independent_oracle';
 insert into dsa_execution_private.certification_checks
 (problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
 values(r.version_id,r.suite_id,'independent_oracle',attempt,'passed',
 jsonb_build_object('method','independent_js_dynamic_programming_oracle','problem_number',r.problem_number,'cases_checked',r.expected_count,'cases_matched',r.expected_count,'fixture_snapshot_md5',r.expected_md5,'scope','fixture_outputs_only','hosted_judge_checked',false,'python_adapter_checked',false),
 '[]'::jsonb,'ReasonAI independent JS output oracle','independent-js-dp-batch10-20261016-v1',null);
end if;
processed:=processed+1;
end loop;
if processed<>37 then raise exception 'Expected 37 results';end if;
end $a$;