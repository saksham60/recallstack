-- Independent bounded exhaustive and deterministic DSA oracles for 29 problem versions.
-- 903/903 latest V2 fixture outputs matched, including rectangular Rat in Maze,
-- non-positive-profit Job Sequencing, LRU, backtracking and data structure contracts.
-- Scoped output evidence only; all learner grading settings unchanged.
do $$
declare x record; n int; hash_now text; pub int; hid int; rej int; attempt int; processed int:=0;
begin
for x in select * from (values
(1,'0f721138-d2ca-4959-8798-0c6e0c540f89'::uuid,'b775f780-3468-4406-acf6-b747c6fdc6ae'::uuid,32,'e01e16fb3265d28a6f30fc92c843dfa4'),
(3,'f682caea-a563-4960-af00-a736bf3b5092'::uuid,'2fff45bd-fde6-445d-ad27-5c0ac27c269a'::uuid,32,'7a05822412deb48d751d5407f2d20d86'),
(5,'ecfd62a3-8c8b-40ab-828a-152e11d61b73'::uuid,'fdf231ee-9ffb-4bd6-8a11-183befed02a1'::uuid,32,'d7427b1f54ee974394f9b3a6007d5891'),
(33,'da78ceba-f202-4c0c-b364-3b6cf3937aa3'::uuid,'59b0ecaa-5492-4445-8823-a986dad9d64e'::uuid,32,'89ee9de4743a4b1433524b4f0a59734a'),
(66,'7e535018-badb-44e8-b13f-338f899824a7'::uuid,'38ae19a1-afb2-41b4-979a-a6bba53b6db5'::uuid,32,'e86b722fae4942ce0543de95f8a16b96'),
(67,'1e6b482b-0e60-4110-b0d2-61450cfda26c'::uuid,'4182b0a5-3ef5-483b-a413-428df7c1eeeb'::uuid,32,'9fe8530fb850c74f55ddd53333bf13d6'),
(69,'a7462144-e84f-49ea-aa7c-6fc21732c3a2'::uuid,'5404053a-b276-4239-9637-602805c092f2'::uuid,32,'33206abbd77225f4b791a523a405f413'),
(90,'7d594137-a8da-40ce-b31c-2e68451c07a7'::uuid,'915eed46-37e0-49ef-99db-ee259bd367a9'::uuid,28,'b579e02760e8328de97d2bafd1a3eb66'),
(97,'4bdbe548-b4db-4f8e-ba9c-ced115b172e7'::uuid,'5fff3179-e211-429c-a9fc-30c1e080dc0e'::uuid,26,'b5cf8db48ae36d40dfb2949d96c40c13'),
(100,'2a616f4a-1754-4439-9749-31834c4f18c5'::uuid,'0b60923c-2fc9-4d79-9a83-eeb829429d29'::uuid,32,'7478d8bb4308f5e19925f57f48dc390f'),
(101,'dd6606be-3657-49d8-b9a6-249019551051'::uuid,'cac70573-7d9f-44c9-a8b4-3ca32ea79707'::uuid,32,'8024a23dcc8646f8e42ac8586c11b076'),
(102,'17c7dd8a-ada0-484f-adf2-66accb34aca1'::uuid,'79dba394-0052-480b-8402-ad6763d61679'::uuid,32,'82d4322446f0e430238cbb104c999be3'),
(104,'939f31b8-9b9d-4d6c-8baa-1cd0799b88d6'::uuid,'491e7583-aea2-41ad-a1e8-a1153ac84e8c'::uuid,32,'b42c0bb89517f24b0491e635fa362e0f'),
(105,'62b5f0e9-232d-4320-84ab-a34f3f196d88'::uuid,'c02006e4-bf83-4e1c-af6a-4b0d21f064f2'::uuid,27,'07ba52af4ede5107a8ca01cab9bff378'),
(106,'0a73908d-1a98-4fd6-b628-a084128f6244'::uuid,'12c5c8d0-2f11-4010-a898-d786d3e34400'::uuid,30,'a423a93cf8bc5fb582a2416cef1e9bfe'),
(115,'02ddf102-99d6-4dc9-858e-5eb69428abbb'::uuid,'307d6e2c-fb54-4013-b371-f50797b53a96'::uuid,32,'d4dcfa17df0e360e76138be111b1a77d'),
(123,'ab7a94aa-8daa-4510-a6b2-7ea66d71bd9d'::uuid,'ad18e66d-0c5c-4a54-9c79-6e5de409f318'::uuid,32,'4e19f59cf12a1382f53bcef78ee6e7c4'),
(137,'a1456267-c33d-4c38-b4d9-c55a170239cb'::uuid,'4655c0a2-e9ec-4b32-91a9-3e6863e6d6ee'::uuid,31,'499f25d96a57db13b76b71d4b3d1ccf6'),
(143,'e9900f50-ef98-4334-86ab-c15cd92857be'::uuid,'33c3f218-91b0-43e4-87e4-6422e52f9591'::uuid,32,'f0af49793bc8eed7e02266d3c54db4b6'),
(149,'3fbbdb35-28ed-4e27-8f4f-0ba6e8e6d32a'::uuid,'dc695c87-8889-4bd8-89e4-94a021a20b03'::uuid,32,'47f04a7b5822f45358fb7d3c520f44a1'),
(166,'504315ce-3c99-49fe-a308-ff3a6af709a3'::uuid,'7d3dfd1b-7c8d-4fd1-a236-8caf04091385'::uuid,32,'fc0ff09ac4d28afa938286e0319a3e72'),
(167,'84722442-5b4a-4753-b779-25c0a49cbeaf'::uuid,'3523a62e-174b-45bd-a8bb-ddd90c557467'::uuid,32,'264438203b841a40081daeef47d98a04'),
(173,'b499e1e6-9da4-43df-890d-475aa2d35643'::uuid,'9e497c13-317e-4130-8280-e2a435434a5e'::uuid,32,'173d05bd4196f3ff1baaa64b741d1dc1'),
(177,'0932f0fa-6ddf-4393-a068-8d3325144da9'::uuid,'4ff68972-fd29-4820-9914-9fafc1940ab0'::uuid,29,'50de8dd18d44407f3060eebdf4acd5f7'),
(185,'b976eb19-b927-41bc-8563-6465b230f04c'::uuid,'ae910f62-888f-4dd3-a686-47093a022bea'::uuid,32,'dad8c8b6c5e364e4861bd8df9aaacb78'),
(186,'bfbaf5e0-0903-49bb-b653-f530d454942d'::uuid,'ac807729-979e-40cf-8eb6-11f2ac3040a2'::uuid,30,'c4f73dfa124f1a6ffa424b6cc2fb518d'),
(187,'f749263c-3c55-4c0e-99e7-ab27c1094dcb'::uuid,'6429e994-dd30-4e55-84c0-b46d4094e081'::uuid,32,'6ced38ed826c8e6d7c2b0847dddd8bb4'),
(190,'3740ad80-4c0f-4646-bf3f-faa288f2432f'::uuid,'21c9ae21-b10f-4bfe-90cd-d69987ec5488'::uuid,32,'43b19e9fec98b840d4ca243988d43250'),
(191,'d0761697-0436-4986-b595-e5b396d36b38'::uuid,'d6f12101-abd6-4045-9e79-482ade733e32'::uuid,30,'7786af8f149d88b090cb84a5a6ac45d2')
) as v(problem_number,version_id,suite_id,expected_count,expected_hash)
loop
if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id then raise exception 'Unexpected latest suite %',x.problem_number;end if;
select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected') into n,hash_now,pub,hid,rej from public.dsa_test_cases where suite_id=x.suite_id;
if n<>x.expected_count or hash_now<>x.expected_hash or pub=0 or hid=0 or rej>0 then raise exception 'Fixture snapshot changed %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-arrays-design-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('method','independent_js_bruteforce_and_deterministic_oracle','problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_hash,'scope','fixture_outputs_only','hosted_judge_verified',false),'[]'::jsonb,'ReasonAI independent array/backtracking oracle','independent-js-arrays-design-20261016-v1',null);
end if;
processed:=processed+1;
end loop;
if processed<>29 then raise exception 'Expected 29';end if;
end $$;
