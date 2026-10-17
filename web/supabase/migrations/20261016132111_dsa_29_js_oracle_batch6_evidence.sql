-- ReasonAI DSA independent oracle verification batch 6, executed 2026-10-16.
-- 29 problem-specific JS algorithms independently matched 915/915 candidate fixture expected outputs.
-- This is strictly fixture correctness evidence, not proof of Nebius/runner parity.
-- All current suite content must match the exact verified MD5 input/expected snapshots.
do $aud$
declare p record; actual_count bigint; actual_hash text; n_public bigint; n_hidden bigint; n_rejected bigint; next_attempt integer; entries integer:=0;
begin
for p in select * from (values
('101ab04a-5f55-4d3f-8c8c-bc852ecfc389'::uuid,'42c46687-c663-44fd-91b4-0e48534ab349'::uuid,32,'04f781c2697bcb0c2ee64282da157b1e',113),
('f689ceca-5ef4-4451-9101-b84ad4095d50'::uuid,'a2569477-b8f0-4e68-9f9d-86e7bf1969a4'::uuid,32,'29a0283454327bf1492c029b2bcaa686',114),
('3578ca07-dd2c-4d58-8c44-d2798ae668a3'::uuid,'08a9f10f-ccdf-4789-94c9-5644fa9f32fa'::uuid,30,'9669175eb9b1be4eb915097a6d27bf87',116),
('64629388-d5ae-4d39-9be8-77fe8f02050c'::uuid,'7a3e2038-56a3-492f-bd46-12de598df0ed'::uuid,32,'bd3f7aa4fc336125e57750cdbdf5325d',117),
('b9232196-84b0-46f0-84b0-3fb134632c1e'::uuid,'78ba54e1-8381-4e4c-94f6-612b59bf882c'::uuid,32,'0411331b19fe8cd43d8eb59189bb19eb',118),
('99ab0c60-26fb-4cff-941e-dd683107fb62'::uuid,'f64b6438-4079-4482-bebe-78a697df0b18'::uuid,32,'3f5c81d13036359836ed3dab5a8abaeb',119),
('08f25911-cd4c-4632-9605-fe3617ea425f'::uuid,'b472a7a3-0346-4afe-87f2-98a96f2320e7'::uuid,32,'b816d37318c38d53d33aabcfa2e8fced',120),
('89bbb3ee-8856-4df8-8fc1-2bb097377643'::uuid,'2e6f0a82-33e7-4045-8ded-6fa4c5486c4b'::uuid,32,'fb328a1825da7478a935b97a63cb8b2e',121),
('971bdccd-904c-44b2-901e-701b273f1dc8'::uuid,'44abc064-cd4d-4465-943e-08406525af75'::uuid,32,'1d6b9cf21e473c3ebcd23fbf014ea032',122),
('4534ab29-e37b-4dd3-b05a-894a86e7d2cd'::uuid,'2e564bb5-41b7-45b2-961e-b3a0c28e3971'::uuid,31,'9800a551a2f3eee067bce9986a86dc63',124),
('73c3bc65-ca7a-4356-8d6e-7175a030afe7'::uuid,'1f59f226-fda9-4cf8-ba0e-862f7e72d9a0'::uuid,32,'b9e0a637b4be52709ad06965e5841122',126),
('3c46c402-6d5f-4a07-a421-2f0d801d7731'::uuid,'28ad42af-d27c-485e-9516-788a67868633'::uuid,31,'08357bc0732595faee919d94341321da',127),
('342d9507-bbd8-4f17-ac73-f3badb92e934'::uuid,'93dfb127-4059-4eac-9646-378757b24e8c'::uuid,32,'9ae884af62a1c8d7629aab95385246b4',128),
('c2446043-951e-45d4-b0f6-103faeca34b3'::uuid,'3c5b1775-ee72-41f7-908e-06efb161aaa7'::uuid,32,'6c3963afe0405c48b4715ef35fee5979',129),
('510a50f4-bf6a-4735-9711-f07c201ab180'::uuid,'98e931fe-6983-457b-9534-e7e90d8931e4'::uuid,32,'08b894eaa8b007018cb683652cbdab80',130),
('16762436-b44d-46ce-8edb-f8126b0fdacc'::uuid,'ad891525-9355-486e-84e1-3e2239a0692f'::uuid,32,'607484963854837d392f8b8921ae1e63',131),
('4f2f3945-7f57-4c4b-9844-b9f72834fdb0'::uuid,'d9eda74b-7299-4b5a-b818-d93ca10901fb'::uuid,30,'7fafd1d1ce44492c33aeaf94e770ec5b',132),
('e47d2acb-429a-43f1-9594-12c3d8ff00fe'::uuid,'e96bfc7c-61d6-411a-9dcd-3e830f91d617'::uuid,32,'f34f338f42b90d2763ad3356bf416281',133),
('52ce337e-5454-4978-939e-e4d492431bb5'::uuid,'3554a7bd-949c-45f4-8b5a-79e49e7ae13f'::uuid,32,'5d3d132208c55d5b8c4671f9e3761989',134),
('02242434-0e27-4e51-ac25-a0d062b97b1c'::uuid,'f9c533fb-3417-494a-829c-0cf107b2a1b8'::uuid,32,'54f671bb4dff10ec9af5e48a19fe1e83',135),
('ab27a420-c51e-4ac3-bdf5-bfd1d7733918'::uuid,'5cd67a5c-9c1d-48b8-9fe6-09402662b306'::uuid,29,'544574293e7374cc05c1da6a1cafaecb',136),
('be1cd1db-6d97-465a-b939-de6c06046863'::uuid,'309c8dea-e1d9-4d5c-a05b-1645bc055721'::uuid,32,'11adbdf1140cfbaf1efee7d7e09ef2b3',138),
('50cf6424-85f3-4919-8e0c-b7df1667ff46'::uuid,'187e5984-3dec-4c57-b157-b70253911098'::uuid,32,'201d7264537c432605e11113b558950d',142),
('8e0854e1-9d5c-4bd9-8412-6df7d71818e7'::uuid,'4afaec4f-c31f-421c-b34c-1032cd0ff2a7'::uuid,32,'28e50813daf34fee0ad75c29e89a55b0',144),
('50e26fac-d008-4975-8c86-282d9347032c'::uuid,'bef12d25-8562-4431-9ffb-d7946a32152e'::uuid,30,'5cc865b60cbe6dc29312f6ab3dcaff66',146),
('b6e623cf-5dc9-48cb-b0ff-a72c8f121ef5'::uuid,'491d969d-0309-4079-924b-1f93c2d2698e'::uuid,31,'03998804406fce8f9c00ee7bd530cffd',150),
('43fd3e6c-5dd6-49aa-8676-1a5262cb0879'::uuid,'8aac91ff-1484-482a-81c7-52496d2eec2d'::uuid,32,'bdda529eeb093b5ca2c58510f02dbec8',155),
('67a06dc7-c1d5-4a1a-9531-63f549e25dfa'::uuid,'4d9045da-c5bb-419a-87ce-40e720fc0ec1'::uuid,31,'6772b8d0d458a00bad4c073c648a7f07',157),
('d668f571-3d30-4ceb-b8d7-867625a86d69'::uuid,'a268409f-b392-4122-93e2-e6a55158af93'::uuid,32,'1bca8b44e2fef448b42e54f25bff1848',160)
) as v(problem_version_id,suite_id,expected_count,expected_md5,problem_number)
loop
 if not exists(select 1 from public.dsa_problem_versions v where v.id=p.problem_version_id and v.version_number=2)
    or (select s.id from public.dsa_test_suites s where s.problem_version_id=p.problem_version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from p.suite_id
 then raise exception 'CURRENT_SUITE_OR_VERSION_CHANGED_FOR_%',p.problem_number; end if;
 select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),
 count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected')
 into actual_count,actual_hash,n_public,n_hidden,n_rejected from public.dsa_test_cases t where t.suite_id=p.suite_id;
 if actual_count<>p.expected_count or actual_hash<>p.expected_md5 or n_public=0 or n_hidden=0 or n_rejected<>0 then raise exception 'VERIFIED_SNAPSHOT_CHANGED_FOR_%',p.problem_number; end if;
 if not exists(select 1 from dsa_execution_private.certification_checks c where c.suite_id=p.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-oracle-batch6-20261016-v1') then
   select coalesce(max(c.attempt_number),0)+1 into next_attempt from dsa_execution_private.certification_checks c where c.problem_version_id=p.problem_version_id and c.suite_id=p.suite_id and c.check_name='independent_oracle';
   insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
   values(p.problem_version_id,p.suite_id,'independent_oracle',next_attempt,'passed',
   jsonb_build_object('method','independent_js_oracle','problem_number',p.problem_number,'cases_checked',p.expected_count,'cases_matched',p.expected_count,'fixture_set_digest_md5',p.expected_md5,'scope','fixture_expected_values_only','hosted_judge_verified',false,'checker_contract_certified',false),
   '[]'::jsonb,'ReasonAI independent deterministic JS verifier','independent-js-oracle-batch6-20261016-v1',null);
 end if;
 entries:=entries+1;
end loop;
if entries<>29 then raise exception 'EXPECTED_29_GOT_%',entries; end if;
end $aud$;
