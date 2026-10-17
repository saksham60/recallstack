-- 18 DSA v2 specialized problems independently validated against 523/523 fixtures.
-- Includes semantic validation for non-unique outputs (zigzag list and reordered characters).
-- Rational outputs compared exactly, plus exhaustive bounded backtracking checks.
-- Does not change any fixture visibility, trusted judging or learner state.
do $$
declare x record; n int; fp text; pub int; hid int; rej int; attempt int; done int:=0;
begin
for x in select * from (values
(93,'5e457570-905d-40f2-a0df-f47cd387c462'::uuid,'b9fd4339-841a-4fd8-83f1-33785524924c'::uuid,27,'86fb30ec121187c43dea273d6b3caa59'),
(103,'d5d7d45f-1dfc-4e45-b8c4-f8726a205963'::uuid,'810e5855-cd1f-45a3-b053-4a45cee1a6ad'::uuid,28,'24bab84a59755081055b0a520150881e'),
(107,'0316127b-a4f0-46e1-b2cf-4920929aeb9f'::uuid,'13946bb8-9e83-4a4f-802a-cf9d047f6117'::uuid,31,'25d2ac626024ed2f334d005374e157c4'),
(109,'84776d36-a704-4f43-aa83-beed149bef0c'::uuid,'76e8aabc-722d-4e02-a09e-d46095116650'::uuid,22,'5dcea116d714f852070dae404049adba'),
(125,'3c7ea267-939c-4a00-9083-072c298f7724'::uuid,'15e214f5-9d17-40b7-80a9-edd7ea523321'::uuid,31,'0bf89022405fd111991ded0585d38022'),
(141,'434aa02d-b585-4a6a-9a4f-c22359fe4ff1'::uuid,'7894e8ea-83f3-4f14-b669-b1b977dc6128'::uuid,32,'348e9bff9d8cee5873c6a4539479cc4e'),
(145,'567aca6b-41e2-4ba7-94de-98e483123d76'::uuid,'4acebff9-7117-4139-bc6c-9fe989c6940f'::uuid,32,'ac240eb272cdae76645fe203e425ecd4'),
(147,'60922864-8205-417e-9b56-082d0c36731c'::uuid,'75808943-e1df-4895-acb8-b5f271932201'::uuid,30,'bf0c97aed7e938312800112cbb8e0c43'),
(148,'cbf87bcd-0645-4757-9cbc-fb90e93fe759'::uuid,'3aa37e79-d2cc-4ae0-8dc5-644119cbc370'::uuid,31,'ce74383986fd99ff1e5d95bc834fdb85'),
(151,'cd7322c0-66c2-4a0d-b8a2-56409fe3e4ec'::uuid,'26592864-17a0-46c2-ade1-1b683a937c09'::uuid,32,'041440a0a6fb6e098491145cae646ad5'),
(162,'d06aa75c-6ca2-4f80-b928-dca3ff5d3692'::uuid,'d9ea50df-9f4c-4b74-84f9-33427b1a73e9'::uuid,32,'7d6a2cc09e9618f75feadf10072bac46'),
(164,'2f01aa37-13c6-402e-a5e5-182aa60d2b66'::uuid,'c905df2f-a3bf-4c9f-8e53-2937836d4958'::uuid,26,'74f72a754c5e28d7db04a65e90feef49'),
(174,'b5c226c3-cc19-49b9-b3d9-f158279d39b3'::uuid,'fc2a6d6a-2834-4184-9a19-3267dd4feb0c'::uuid,30,'0a6d99e195b124de30d399ac7a8743c0'),
(178,'b198a210-3c46-4146-b690-3a716dfc23b3'::uuid,'6681acec-9cb5-4121-bbd1-71ce9fb1be1d'::uuid,30,'6881d4dd693ab0005b81e59e9e82865d'),
(179,'5ea68675-5075-438f-9d1a-7701d265954d'::uuid,'58bf37ed-b2c9-4f70-b017-52985da50cb6'::uuid,32,'80cfff9ce67746da67d212e685514020'),
(182,'40d90d62-15f5-4fd1-8da5-696107b850fe'::uuid,'db4a2f2e-fbcf-480c-a14f-58a1daeb507e'::uuid,26,'f315455c5eb55d814ff57916cd4e193d'),
(183,'1343bffb-8266-4a2e-bda3-21fdf08cafa6'::uuid,'53cd0426-e7cf-476f-a0d8-b00ce9b150ae'::uuid,20,'22d325f30597d1645fb84412d09ce877'),
(188,'f7df7f9a-af03-4531-b995-534275eb2c9b'::uuid,'b13b38bb-055f-4ac0-b1b7-398137b31f34'::uuid,31,'2d73a024067f184a06c5222a3583dfe5')
) t(problem_number,version_id,suite_id,expected_count,expected_hash)
loop
if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id then raise exception 'Unexpected suite %',x.problem_number;end if;
select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected')
into n,fp,pub,hid,rej from public.dsa_test_cases where suite_id=x.suite_id;
if n<>x.expected_count or fp<>x.expected_hash or pub=0 or hid=0 or rej>0 then raise exception 'Snapshot mismatch %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-design-greedy-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks where problem_version_id=x.version_id and suite_id=x.suite_id and check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_hash,'method',case when x.problem_number in (125,188) then 'independent_semantic_validity_checker' else 'independent_deterministic_oracle' end,'scope','fixture_expected_output_validity','hosted_judge_verified',false),'[]'::jsonb,'ReasonAI independent design oracle','independent-js-design-greedy-20261016-v1',null);
end if;
done:=done+1;
end loop;
if done<>18 then raise exception 'Expected 18';end if;
end $$;
