-- Evidence only: 25 independently implemented output oracles, 793 matching fixtures.
-- Verify current versions, suite revisions and hashes before recording; never certify a hosted judge here.
do $audit$
declare x record; actual int; digest text; visible int; hidden int; rejected int; attempt int; touched int:=0;
begin
 for x in select * from (values
(229,'1306ce2d-9bfa-4043-8bfe-063e538bc325'::uuid,'995166f3-3fd0-4ac2-b329-cf9c6b77afcf'::uuid,32,'3c150e840dc8db47ba40fa6da640f6a7'),
(231,'3a639625-162a-407f-bb60-b3664f13f23f'::uuid,'98a40c87-2703-4dc9-a86b-134b1cd69dcf'::uuid,32,'52e547617109947164f4e31e7d26c272'),
(232,'6e1629b4-2b17-4d2a-8409-62c146acbb31'::uuid,'ad084303-1967-44a2-a93b-407a444084c6'::uuid,32,'673353d71ad20322f06d80ccad224b50'),
(235,'f17529fb-e3b9-4d68-b312-aadab89d50fc'::uuid,'edbaf111-792c-4279-94d3-402460dcd2a8'::uuid,32,'7b97555fcc306da27e73feef17a55172'),
(237,'dee26901-b441-461c-84e5-ba6f6cdd974f'::uuid,'5fcba3d9-ba23-475a-ba2a-612646b65552'::uuid,32,'69320fb76e64c6b3fa1fcc0b16537fe7'),
(239,'4b430455-aaf3-447b-a16d-b722d6777e08'::uuid,'c2341385-4523-4c72-89a1-1cbb2dd97bbd'::uuid,32,'90ed7122e53a3b8a74c28b68ed1b5b77'),
(241,'b417b9e3-7f02-4208-a825-dc97bc9a2dee'::uuid,'8ca62b39-ee71-4dcc-9c4d-5824bc773723'::uuid,32,'336e36cb9347ee1deb1e049e7dda18b4'),
(245,'4817437b-4d40-40f5-8b62-ebd9fd653b73'::uuid,'1f6a5198-3b91-4ae6-a5d7-452c9cdc19b5'::uuid,31,'2688fb1e438bdae0af57639fd94dd750'),
(246,'ad362f25-268d-4cdf-86bb-ca2335bafc0d'::uuid,'cfdbf11c-8161-4a7f-82b7-5d331cc17ddd'::uuid,31,'2f968d07053d1b8537157be24a06fedc'),
(252,'4db3c2b6-dce0-410b-b44b-7d12940af5c5'::uuid,'f81686e7-3691-43ec-82be-523b75c58cdc'::uuid,31,'1a50b96360bf14975219d5a5713302c6'),
(253,'d8541ee4-e8c1-47ba-b500-d589ee37669f'::uuid,'1465c832-9702-4d15-8fee-d39172eceb9a'::uuid,32,'c93c4d644a943f7e841c5510eccfcb3c'),
(254,'773e9c74-c364-48d8-858e-643d9b52f92c'::uuid,'ba297ad1-cf6a-47f4-a7c5-e271abf1e6b2'::uuid,32,'4b3d7bc67e81fbc04ff5ff5fef545f3b'),
(255,'268eee38-0d25-4b95-8455-a6fc8aaca4cf'::uuid,'3afd7d2f-cc37-4148-86f2-54fa4990e778'::uuid,31,'e1b743ed0d264c53d7b12b3028c6ceba'),
(256,'2ff8bb43-005a-4b4e-bf1a-bfb90f88d8e3'::uuid,'10bb53ef-b514-4d14-9863-780c94a2895d'::uuid,31,'174d73d13253727cb9493183a2b339d3'),
(257,'a1da9b9c-ae32-45df-925f-14f66b378384'::uuid,'1637e939-33ed-4eb4-b4fa-c27ffe99200d'::uuid,32,'7aa598904bf2b43a87d1178b1eb4f05c'),
(258,'189d5027-025a-4103-81c0-c70c47bdd3ea'::uuid,'28dc2497-6590-4cdf-b2ed-248a2ba9305d'::uuid,32,'f5ef392b05ca3d6d8e06cf5531467d42'),
(259,'4225e05e-9a40-4db3-a491-d3dd5ab6e06c'::uuid,'e5e0fb6b-2272-432d-be31-b9d0523e8b34'::uuid,32,'045eceec904412699ec55fe5966762ca'),
(260,'8ed16482-ddb4-4502-bbdf-321622b04934'::uuid,'90ccf286-8558-457e-8cd8-893b97b472e6'::uuid,32,'3a749124c0f7b3c027d37019b7f4b8be'),
(261,'66f61741-1a35-469c-a070-8e811322eb39'::uuid,'155930a7-0089-4f4e-8783-79f2f7a4fc77'::uuid,32,'0d016a7f165477dfb94fab21d2b07f58'),
(262,'e3aa6f79-8f49-4b5a-894d-a23dae192919'::uuid,'acf4223d-d1d0-44d3-bc11-bdaf9675e5ea'::uuid,32,'f1287a6d3c3146173bfc720ac641a40a'),
(265,'32f1f3c8-e02e-4c59-8581-c9155fe55fd8'::uuid,'93f4d1b4-4743-4fae-b478-e6541c86656d'::uuid,32,'9b625a83b8542322eff1d7e9484f39d4'),
(266,'56967eb9-4509-4ba7-aaeb-93e9c0319da5'::uuid,'afb76801-564d-4e93-ada6-2ee31018555b'::uuid,32,'fa481736ea6dffd029b5695ebb822c4c'),
(267,'2302adaf-25ff-4d7a-ab91-84dff31491c3'::uuid,'28b1d4d2-e1d2-4ef0-9ac5-ee10fae0b479'::uuid,30,'a89c320c465653400907d39b6f77275c'),
(268,'6716162c-f8a9-4b4f-9d52-f6bb938b9429'::uuid,'963b40d2-ae21-430b-b696-8884f9d82315'::uuid,32,'fe4daf69655f9c63c2fdf45fd5026cd0'),
(269,'da7502b2-ef5f-4ec5-9cb2-8bfaed3fab34'::uuid,'052063bd-9512-4129-97dc-bd8d40c5cc0c'::uuid,32,'142b6b697b1df706145f36de29a28d34')
 ) as k(problem_number,version_id,suite_id,expected_count,fixture_md5)
 loop
   if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
     or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id
         order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id
   then raise exception 'Invalid latest suite for %',x.problem_number; end if;
   select count(*), md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),
     count(*) filter(where t.visibility='public'),count(*) filter(where t.visibility='hidden'),
     count(*) filter(where t.validation_status='rejected')
   into actual,digest,visible,hidden,rejected
   from public.dsa_test_cases t where t.suite_id=x.suite_id;
   if actual<>x.expected_count or digest<>x.fixture_md5 or visible=0 or hidden=0 or rejected<>0
   then raise exception 'Snapshot invalid for %',x.problem_number; end if;
   if not exists(select 1 from dsa_execution_private.certification_checks c where c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-oracle-batch9-20261016-v1') then
     select coalesce(max(c.attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks c
       where c.suite_id=x.suite_id and c.problem_version_id=x.version_id and c.check_name='independent_oracle';
     insert into dsa_execution_private.certification_checks (problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
     values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',
       jsonb_build_object('method','independent_javascript_problem_oracle','problem_number',x.problem_number,
       'cases_matched',x.expected_count,'cases_checked',x.expected_count,
       'fixture_snapshot_md5',x.fixture_md5,'scope','fixture_outputs_only',
       'hosted_provider_verified',false,'judge_contract_verified',false),
       '[]'::jsonb,'ReasonAI deterministic independent output verifier','independent-js-oracle-batch9-20261016-v1',null);
   end if;
   touched:=touched+1;
 end loop;
 if touched<>25 then raise exception 'Expected 25 got %',touched; end if;
end $audit$;