-- Independently checked BST/tree fixture outputs for 22 problem versions / 683 cases.
-- No hidden fixture contents embedded; exact current-version digest precondition.
-- Tree Maximum Path Sum and K-sum Paths remain under investigation.
do $$
declare x record; n int; fp text; pub int; hid int; rejected int; attempt int; processed int:=0;
begin
for x in select * from (values
(215,'3b292c04-3817-4ee4-934e-f882a8139844'::uuid,'044aa341-171c-47ba-93c0-260784addb91'::uuid,28,'c3aebde021f6aaabea89af657dac36c2'),
(216,'b6da0d04-b8a1-4ebb-8ad2-740750a3d023'::uuid,'8c8644ba-0c2a-4865-8110-d2c16a11ea1c'::uuid,27,'4b8dec1ea996f75752cf4f96a51d9b9a'),
(217,'3ac79700-bf6c-4e66-b720-5a6b5ec20262'::uuid,'e1354616-10bc-49f3-bfaf-693d1279e200'::uuid,32,'f963d19659d326744e64191169dc70b6'),
(218,'62d37289-ac6b-4ae8-826e-fb58fc7ded92'::uuid,'a93b8ecf-d3e1-44d2-9d67-67f31545348c'::uuid,32,'8a0b67854f276648fb9fbbc9abd22247'),
(219,'bd632b2f-6e31-4356-99c0-400ab7064e48'::uuid,'ae23c67a-fff4-4338-9f43-817e51547827'::uuid,32,'89cf66d4b64cc5cfb032143dbbc0cf01'),
(220,'263a101a-186d-422f-aca9-8c65392b0f68'::uuid,'47d0cd7b-9721-4a7f-8bfd-38b05495fc5d'::uuid,32,'fffde4beb85ea858a7ed726833038159'),
(221,'10d0f193-a0f4-4b9c-b2d8-5b1a574cbd9d'::uuid,'b90f0081-65b9-4945-85c0-e8501dc2f1ba'::uuid,32,'426c95d07b58b4f4496aa026c2a01a7f'),
(222,'d5d1b9d6-5f5d-48ef-9c7e-980b56986025'::uuid,'f0eeedf4-a8e4-4778-90a3-3595aa0b560c'::uuid,32,'4a8630eb59d2853a3cf65ea2624b4f1e'),
(224,'66b3c8a1-35f4-4ae7-8c8d-15389f65aa9d'::uuid,'083c26e1-5e70-4b67-9534-78dccf64ca64'::uuid,32,'0a92252a493c8ca5f6aa03bbbb1520c8'),
(225,'a411fa8e-4139-4e18-8a2c-c27d9e38dfc3'::uuid,'1cfd6295-92e1-41f9-b359-32f2337b7b34'::uuid,32,'03397377aa90919838fe14526fe9ec01'),
(230,'4d051f28-6d09-43c2-b3c4-1c48df3bbe2c'::uuid,'11ca5a2a-e5b9-4d49-9514-25145eb79f49'::uuid,32,'c97627ac01efbacf702c27ebfd1f3384'),
(233,'72ac01bf-9f15-49b4-8240-e5662ff4849c'::uuid,'100fdcdf-bd31-4343-a00b-98ed70de6fd7'::uuid,30,'6735804d1a2147b1385959924557e400'),
(234,'d02d73f2-4c78-490a-ab20-b8622a1df1fb'::uuid,'92d13f0f-e1b2-4e2b-a2c0-fee38027b403'::uuid,31,'796ff5c16b017abd469f66a37802a8f2'),
(236,'7e9bd97d-ccba-4071-acb4-13e86662a1df'::uuid,'73171257-8bc7-4251-b4be-d73fbb405e42'::uuid,32,'a2eb14aede5f503d886b3cd0bee860a8'),
(238,'cbff15f0-df28-4266-a6f8-f5091c212d67'::uuid,'ecc049ba-2a01-49c5-ac67-7b59696a7320'::uuid,32,'c09fb3fdcb2ef7115c44f1355fdb5fbe'),
(240,'951a5a50-01a9-4cc9-8b8b-4e2898c8f817'::uuid,'ff8d19e2-245b-42b4-9b8d-ac81eccbd211'::uuid,32,'454d5d08238ca50fb1218f07b5153768'),
(242,'9fd2f3bf-5b90-4dc1-9aa0-abbe71bc1b29'::uuid,'2f1a5728-b014-49f6-92da-59db02de53da'::uuid,32,'3e569f5727e46325a47c6312952bea6b'),
(243,'b69e96a1-6935-4969-a111-66a7de0842e0'::uuid,'591b5833-9b25-4131-84f9-8a0ff7c65d0d'::uuid,31,'120dbbc2e15ff7cc844ee5ae0c001dc4'),
(244,'1434d29a-5c3a-4841-a935-f8b8faebae81'::uuid,'68822e42-ece8-4c55-9c49-a7ba4887c72b'::uuid,31,'d28f1828da4e279f9652674f5428f831'),
(247,'7b195844-994e-4da7-9202-da7c956e2163'::uuid,'b66d6d09-e840-476f-b327-3d6322a8dbed'::uuid,29,'8b0d6fe88739c4a0c494fb47c854ccbc'),
(248,'a6077e1a-300c-474f-ad49-f303b4d25d18'::uuid,'1bb66c96-7047-483e-9555-47a32e6f24a8'::uuid,32,'1ce6ded35739e38ce11608ab2ccf43a5'),
(249,'37145b05-eb8d-4b42-80ad-07e87392d927'::uuid,'ab395dab-6d05-45dd-aa33-aae72c352a44'::uuid,28,'1c5ac118ee4d7f1d2a0c45d2c85cc130')
) as z(problem_number,version_id,suite_id,expected_count,expected_hash)
loop
 if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
 or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id
 then raise exception 'Changed version for %',x.problem_number;end if;
 select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected') into n,fp,pub,hid,rejected from public.dsa_test_cases where suite_id=x.suite_id;
 if n<>x.expected_count or fp<>x.expected_hash or pub=0 or hid=0 or rejected>0 then raise exception 'Changed fixture snapshot %',x.problem_number;end if;
 if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-bst-20261016-v1') then
 select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks where problem_version_id=x.version_id and suite_id=x.suite_id and check_name='independent_oracle';
 insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
 values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('method','independent_js_bst_and_tree_algorithms','problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_hash,'scope','fixture_output_correctness','adapter_verified',false,'hosted_judge_verified',false),'[]'::jsonb,'ReasonAI deterministic independent BST oracle','independent-js-bst-20261016-v1',null);
 end if;
 processed:=processed+1;
end loop;
if processed<>22 then raise exception 'Expected 22 results';end if;
end $$;
