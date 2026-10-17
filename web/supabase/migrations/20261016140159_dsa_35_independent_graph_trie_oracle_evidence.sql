-- Independent JavaScript algorithm verification, graph / trie / sliding window batch.
-- Verified 35 latest version-2 problems and 1071 expected fixture outputs.
-- Deterministic output oracle evidence only; no sandbox parity or official verdict asserted.
do $batch$
declare x record; n int; snapshot text; pub int; hid int; rej int; attempt int; done int:=0;
begin
 for x in select * from (values
(270,'80b18c52-f1e4-4a5f-bdf6-3a7c68260e15'::uuid,'45c1405d-5c1d-4b60-92f9-8e99941b07e5'::uuid,32,'38072f32954756f5e1b137fd3cd1c947'),
(271,'a9cb2651-c72e-4f65-97ec-7cf438998c76'::uuid,'fce895fa-fa44-4e90-b73c-67ceedaceee0'::uuid,32,'3bed304a40bf94ea99acfc3ebce4185a'),
(272,'22874065-c273-433d-a506-6249f64102ba'::uuid,'3a3a1ec6-bf5c-411c-9d43-50eb857a7608'::uuid,32,'e42a12d9e9a57582bc800888231ed050'),
(274,'d9bdd20d-4015-4eed-bb52-f95eb63f71c6'::uuid,'9810e392-7d2a-4d6a-aeb3-62e140bb50fc'::uuid,32,'1d9b5a88a6a24eeb6a4e095174332d9f'),
(275,'e6e6dece-3565-41c0-ade3-064d3d4adbf8'::uuid,'b19e945e-e485-4d87-b052-d59f14c8d8a6'::uuid,32,'7330c9988b249804c7ca5d48d4dca2c3'),
(276,'ccb34fc8-9c3e-4c05-84f6-f48cef6e9a94'::uuid,'6e0b71eb-160b-47d5-a523-464dfbb805a1'::uuid,32,'cecd807c487a32066c5ed5c9117bc8a6'),
(277,'7435ab1f-831e-41ce-960a-3181cc0b6b54'::uuid,'f46d2f2f-5073-4f99-b2e8-1d6e4ea04688'::uuid,32,'49f1c3fdb5dab596ef54b02009013e81'),
(279,'afa894c5-e16c-4296-a4f5-77c8f3b84ee4'::uuid,'2035489e-2766-494a-9a43-27f0f9cfc245'::uuid,32,'e43598f0eb2639580f7baea5a61d9e90'),
(282,'9b7fca27-dcb9-4ec6-a17b-8dc053066d47'::uuid,'2eb79823-3fbe-40a7-b8b8-2cdfe273c6a5'::uuid,28,'ab743f4f13088dfdfe57bbecec6cf524'),
(283,'f5a5d348-d0b1-4452-b402-0dbb496be0de'::uuid,'9f5cd226-0889-43f5-ad54-58b919a6532e'::uuid,30,'776c38c3b5286838d6be2084236dd9ac'),
(284,'97c9efa2-67ae-4e9c-9c27-8680e2c2c69b'::uuid,'267f1026-df47-43d1-addc-b56c9e127a3a'::uuid,31,'b45896cd64b928da5ccd860134a90b7f'),
(285,'14629dff-0078-4e1e-94ff-6d609960bb26'::uuid,'33ff502c-9ea7-4d40-b867-7b908d26036b'::uuid,24,'43cbe8179d382a638715279cc749e10b'),
(286,'4a12d6d8-e881-46c4-aca0-301f83a2e960'::uuid,'e4bdc075-f286-4b6f-b41f-c1bfa2671b9e'::uuid,30,'776ab0d93398c44ec6e2cddd57005dc8'),
(287,'82f44191-8ad8-4504-a4d5-cab9fc1b27a2'::uuid,'04ef576e-3876-4931-9dd1-015125cef734'::uuid,31,'e788d41de25d13674e8769c167d8986f'),
(289,'28ba0cef-7ea4-466a-87c4-5669be878216'::uuid,'c5655dea-5658-4d1e-a03b-794d00466e15'::uuid,32,'eb89c3b0edced71b643da4354cc2d823'),
(291,'d276a761-4bb7-4382-ae31-238af33a5cfe'::uuid,'9a8bef0f-53e1-483f-8b1c-529288ffb0b8'::uuid,31,'2a95de1dbb877b3aa7cfaf09a1298eed'),
(292,'fdfbe747-c0d6-4a32-86ba-116da61246cb'::uuid,'441d0d96-8547-4bc1-bf6e-1098cac44c75'::uuid,31,'5fa705593e896426f988b9b62b7b4471'),
(293,'00b11465-b08f-4c6b-b35f-54f993dfec00'::uuid,'fae4c09e-03af-4d48-886d-fe878d6358dc'::uuid,27,'c4069bd54455194c5b4b5cc1e87a2a99'),
(295,'efb80572-eebb-4d3c-a2f2-c91193f0110e'::uuid,'e707bd77-f775-43ac-b668-ec4a550da429'::uuid,29,'2f26a0de597d4c685567cf93ced25d54'),
(296,'955c4ae3-5549-4b4c-85b9-44e80a56cf56'::uuid,'ed71f70c-0486-45f8-8131-2e691e369cc9'::uuid,32,'14e03e44c40ec6f62e2f9886f527d12c'),
(297,'f020318a-e6c4-4885-a355-538c9aa28da0'::uuid,'0ad35af6-864c-4491-b439-cddede0c8496'::uuid,27,'a598d4a7baa0d1953d460f730a913c14'),
(298,'b22c5e34-028c-4429-a3e7-7944b1b8e3d6'::uuid,'c0895962-f303-4489-a8d1-db4161e9dc9b'::uuid,28,'782a56bc7fb4f9c0fbbe6baf427a0cad'),
(300,'f64f3813-d0aa-4032-8c86-2d1f13f20fa2'::uuid,'7ed0a68a-26c8-4265-8277-ccbaabf5897f'::uuid,32,'1c7efd01040b1b2f04f06885598ef9f7'),
(303,'ee3915f6-d141-4a23-9d19-2044df3b5be5'::uuid,'3d74f866-9990-4f2c-b7b0-51bc0ca9bb77'::uuid,32,'a81ac982b119daa1625b98fc78315d98'),
(304,'1c232e36-bb55-413b-9508-8570f8fec936'::uuid,'d9b56d23-fa71-4252-a1e1-71e0e6f7a740'::uuid,28,'857b28cc963f6b59f5d3cfaed2c7bf53'),
(310,'5063b6de-0f7d-4e29-9bed-e1bdced2cba8'::uuid,'3cfc58df-1e81-4959-93da-4875c98e2a92'::uuid,32,'fc2a1bfa4fb2bed77bd0da726f98baef'),
(313,'d1829f29-bed5-41b3-b4eb-2547c3cf0225'::uuid,'b3087794-a9b6-42a1-b925-de4590a59798'::uuid,32,'4786d9fc52947af0216b7e986ff996d9'),
(317,'2d2cd8ee-1cc2-4473-ae37-ca92526233eb'::uuid,'82896347-bcb2-403f-885b-c41566f2251a'::uuid,27,'3f1bf34393cfbfad77d59f6455c3579f'),
(320,'73b342f4-3661-4e31-82f8-81daa9501693'::uuid,'5da416c6-1242-4b82-865d-e9c8cde492b5'::uuid,32,'5744c7a8bd0d33a7a52629570a6a7d4e'),
(321,'6fbd8ef9-5ae3-436a-86d4-1f35053e96f4'::uuid,'e8f71d3c-1e04-4e3f-8e7a-cabe41e3aeda'::uuid,32,'fb5edb28f90dbf23a55e454cb090d62e'),
(325,'9151ef4e-d14d-40dc-89f9-d7d83b56f53d'::uuid,'dd8c4ef6-b52b-4aeb-846e-42ebae13856a'::uuid,32,'0e4350f5f6254060fcf22060c3285d59'),
(326,'d949d99c-ac88-4456-b8c9-34543da0c95e'::uuid,'65bf7ce6-6445-4d68-89ce-8fd8aa0c7cc7'::uuid,32,'04292e24f34384c3f1b161ef27d1507f'),
(327,'3c9a36da-ec66-4d6e-accf-83e88c7ed8a8'::uuid,'d983fea5-e68b-4137-a80d-ef0aeb32e9db'::uuid,30,'39579b813027273a824dd47a81559e12'),
(328,'0c8722fa-1e5e-4a5d-b65a-c07b1e7957b8'::uuid,'c92fea84-8b45-4976-8ab2-9dd2e6d1b193'::uuid,31,'014a8084d5cb9b1418ef678d1a70cdff'),
(329,'b9ada6dc-e196-4af2-af81-15d9fd1365eb'::uuid,'7d30598b-281a-4882-9066-1cc3f1a0e0ff'::uuid,32,'6de875904d3fc98cdd4f34910b9e96c5')
) r(problem_number,version_id,suite_id,expected_count,fixture_hash)
 loop
 if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
 or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id
 then raise exception 'Version mismatch %',x.problem_number;end if;
 select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),
 count(*) filter(where t.visibility='public'),count(*) filter(where t.visibility='hidden'),
 count(*) filter(where t.validation_status='rejected')
 into n,snapshot,pub,hid,rej from public.dsa_test_cases t where t.suite_id=x.suite_id;
 if n<>x.expected_count or snapshot<>x.fixture_hash or pub=0 or hid=0 or rej<>0 then raise exception 'Fixture snapshot mismatch %',x.problem_number;end if;
 if not exists (select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-graph-batch11-20261016-v1') then
 select coalesce(max(c.attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle';
 insert into dsa_execution_private.certification_checks (problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
 values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',
 jsonb_build_object('problem_number',x.problem_number,'method','independent_js_graph_and_trie_oracles','cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.fixture_hash,'scope','fixture_outputs_only','hosted_sandbox_verified',false,'source_contract_verified',false),
 '[]'::jsonb,'ReasonAI independent deterministic JS oracle','independent-js-graph-batch11-20261016-v1',null);
 end if;
 done:=done+1;
 end loop;
 if done<>35 then raise exception 'Expected 35';end if;
end $batch$;