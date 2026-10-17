-- Independent correctness checks for 24 DSA v2 problem suites / 730 fixture outputs.
-- Implemented with combinatorial, graph, trie, DP, and exhaustive bounded oracles.
-- Existing learner-facing and judge certification statuses are unchanged.
do $$
declare x record; n int; current_digest text; pub int; hid int; rej int; attempt int; done int:=0;
begin
for x in select * from (values
(263,'44b46df3-a2fa-459e-b244-b6a0368b098c'::uuid,'c37ff27e-bb35-469f-8bdb-0eb96e692175'::uuid,31,'d38ef539f00b1f1e92a9c77478febfa8'),
(264,'6ccc6f00-425f-432c-96f5-dda2521fbbc3'::uuid,'18828a31-d646-4270-b1bc-3190251a1475'::uuid,32,'6380dff1365f941b14a96bfc31b376a4'),
(288,'aea149b0-e9e0-4880-9f9b-f44667ceb6d1'::uuid,'928546b4-7f22-4385-9984-77395447a905'::uuid,20,'ad46d4d3321a226013ae79055cddd8b0'),
(324,'e1aef5b4-9246-4f44-80a5-c044a37b7c0a'::uuid,'24c7751f-68d8-4928-b6cd-f71fdbd960a8'::uuid,32,'e95c30b779fbeaf6af5a92fdb4bf4fba'),
(362,'5be3a3c7-2eb4-4138-9c03-beb7a2246672'::uuid,'66e1cffd-8693-434c-9a4b-046f19257329'::uuid,31,'1e8fc835fd9cd7f5046cf2d15cb0c98d'),
(376,'c7a03420-5dcf-4004-a5c2-3a5ae9bb8748'::uuid,'4a831e11-fd58-4b61-9b97-92f063d0aa7b'::uuid,32,'54a80d9f6fa2e24e7351398ec4faf3dd'),
(377,'e744e10c-eb64-4f74-b3bd-91ed10fc9357'::uuid,'47b2b55e-3543-42bb-8ac5-4057f9630d28'::uuid,31,'55fc8045619913e0275ed45e3b5787f0'),
(378,'9d6d7c49-11fb-45e9-9fbc-2f65bc6cbf86'::uuid,'f3409731-76ad-40d3-a2b9-d4c40686e515'::uuid,32,'4d2e90e6f8403570f8539660225cfde6'),
(380,'d19582d0-c2aa-40dc-bf0e-c94036c0978a'::uuid,'c857d2c2-f6d8-44c3-a6e7-5d03bd23641c'::uuid,29,'055d02d13cdf506ab892991f7c694cc1'),
(381,'c17217a2-bb08-4170-9ace-cd1c625c87a3'::uuid,'b51fc9bc-3443-42ea-874d-16bc65dc4d59'::uuid,32,'f8e5d6125fa09704132d86960ed52b91'),
(382,'c78b2dc0-d04b-4eb1-86b5-23580904fbb2'::uuid,'afac6877-04db-42c7-89c2-6ea3ad9a4487'::uuid,25,'99e52a2a07a93670f932c96a3aae42a5'),
(383,'6654b65d-eb29-488b-8b09-ca0ec3f0cf30'::uuid,'6f080376-a78d-4c5e-9ff4-221128a740b8'::uuid,31,'1f527df6d9a0b6ba2cd1c2356a5aae1c'),
(384,'1386321b-4c29-4e98-9362-fe2e567fd1c3'::uuid,'03010b75-a63c-408d-a6fd-09127bbdda5f'::uuid,29,'ee07a893afb3f91f33eb1e76a1528714'),
(385,'0f9039fe-f4d1-48f5-a015-aab7a51ecbb7'::uuid,'06a05579-ca02-4aeb-9892-26d736fa5e1b'::uuid,32,'20dbd8204f80adf1b950e57bfad09675'),
(389,'6b4352c7-cfcd-4b13-b8bc-00d148248ba9'::uuid,'ff035a1c-3db2-4793-824e-2733dadee963'::uuid,32,'1beaac00acd6411c4ba7e0dcbb83f2b0'),
(390,'23e2f753-66d7-4e29-abce-d85ac7c9ba52'::uuid,'9deac3af-ebec-46f6-9d46-ca5dd15282ac'::uuid,30,'b1403aeddfecc1f3756b39be55c4acfc'),
(392,'d62be137-fa16-495f-bc4f-4adece8a48a6'::uuid,'feb0c756-87a4-4b63-81cc-426543c2dd68'::uuid,32,'db1752abb9ed57e33b7d162eb2065f61'),
(397,'d32c4a87-7609-47b6-a9f4-44b371989312'::uuid,'da6653d3-9e38-493e-b4a7-262c9e3dacc1'::uuid,28,'9a748c353279184fcdeda1c246d67665'),
(400,'e9a6ab6b-2d51-437a-96b9-158bfec6d474'::uuid,'fa5efa1a-8b41-402c-bef4-d0708059bd70'::uuid,32,'d20a18bce7f4031fa3c4691319e828e4'),
(401,'2efd9ff5-473e-4ed3-8703-3b0b9515544a'::uuid,'6035a991-2cf4-4286-980c-525f135367ca'::uuid,32,'e62cd7f6a379e38db3b3bb322237c544'),
(402,'f2a5e883-be66-4331-9f6b-5a6372be9bad'::uuid,'3c9f415e-1aee-406a-8f3b-0333971d6afc'::uuid,30,'0fedebc3be88a958b7c05be7b60df1d2'),
(403,'96b6aac4-2ee2-46c0-aad5-6d8968faca6a'::uuid,'9daa4e34-aecc-4584-9e28-1511f482ff48'::uuid,32,'15c7bee71b28bed4cdce73720c94680e'),
(404,'51678467-8287-4c3a-b9b2-ea04c8f4e2e6'::uuid,'a611a800-dcb1-40c6-9576-63d3654bf986'::uuid,32,'7524e38b846268eec7eaff5994f20c7c'),
(405,'af8ee2fb-1c33-4696-ba64-7ab56d591747'::uuid,'571cf656-6770-4dca-89c8-ffb79908b750'::uuid,31,'c9da067cde1b6a4e3cc66cc8735c6890')
) z(problem_number,version_id,suite_id,expected_count,expected_digest)
loop
if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id then raise exception 'Version invalid %',x.problem_number;end if;
select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),count(*) filter(where t.visibility='public'),count(*) filter(where t.visibility='hidden'),count(*) filter(where t.validation_status='rejected')
into n,current_digest,pub,hid,rej from public.dsa_test_cases t where t.suite_id=x.suite_id;
if n<>x.expected_count or current_digest<>x.expected_digest or pub=0 or hid=0 or rej>0 then raise exception 'Source fixtures changed %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.suite_id=x.suite_id and c.problem_version_id=x.version_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-combinatorial-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks c where c.suite_id=x.suite_id and c.problem_version_id=x.version_id and c.check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('method','independent_js_dp_combinatorial_oracle','problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_digest,'scope','fixture_outputs_only','provider_sandbox_verified',false,'checker_contract_verified',false),'[]'::jsonb,'ReasonAI independent algorithm verifier','independent-js-combinatorial-20261016-v1',null);
end if;
done:=done+1;
end loop;
if done<>24 then raise exception 'Expected 24';end if;
end $$;
