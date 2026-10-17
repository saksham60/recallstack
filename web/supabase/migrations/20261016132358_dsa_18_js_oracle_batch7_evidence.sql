-- Independent deterministic JS oracle verification: 18 more DSA problems / 553 cases.
-- Stores only fixture correctness evidence and refuses any mismatched current snapshot.
-- No hidden fixtures, official hosted certification, test row validation status or learner data changed.
do $verify$
declare x record; n bigint; sig text; pub bigint; hid bigint; rejected bigint; attempt int; count_problems int:=0;
begin
for x in select * from (values
('203bdc0d-28a0-44f8-b20f-2f3fdd23c2e0'::uuid,'694071d7-689a-41d6-a9a6-17f1935859b2'::uuid,30,'413b52ee95ca17a34792c2ab8ff8517d',152),
('309d4849-fbe2-4118-a234-ac52efafb089'::uuid,'2b119ed6-d5f8-4e84-a362-398b99c68361'::uuid,32,'679dce0317909db12ce23f06eba49294',153),
('d5470e06-0863-4752-b862-c161a6173e4e'::uuid,'49b47a3b-a63d-479a-800a-c864b7732b40'::uuid,30,'88c3715cee01ea9131f352ca7dfb10ab',154),
('d2ddfa00-1436-4e0e-8839-a24919440465'::uuid,'7db29368-18b7-4f39-a72c-891806cccc8c'::uuid,32,'8ee5f192a265b44edbfcca02a178f946',156),
('b536459c-c349-4cf3-a5cc-6f7bf40591a0'::uuid,'8dd4db90-c1ec-49a2-b50b-ca3907da8e84'::uuid,31,'99306e8efecc91d95563c51f6f29f0e6',158),
('de9f4413-08ff-4b31-a9c4-c1815ed148aa'::uuid,'be0823f9-7556-4f3f-a5b9-b5b2a53ed2cc'::uuid,24,'8e5ac0fb27db33760c8b27a3114487df',159),
('642ea664-a3ae-4a02-ada8-c7e3c4e9821e'::uuid,'a02ba590-8c93-43b9-8709-68173e8c3f05'::uuid,32,'d04419ceb32709d9fcf27bff4c2fadd5',161),
('7f585a22-0bd9-4653-86e1-f0b33ab0efb5'::uuid,'45cee801-5bd0-4858-b08c-2d8e98d38afd'::uuid,32,'d1456ae4985d7dbc83fd0649ea460ade',163),
('2bd9f3e6-62ce-4bf4-bfa6-0c25e2a4b810'::uuid,'6dcf16ea-5da7-4392-bc98-6bcad891e8d5'::uuid,31,'dd1ef7f6b98e690742d5fefca96147c9',165),
('4804d713-eb5a-4d94-92f6-f79b7ebb273d'::uuid,'f2f87ab5-5154-4950-9f72-0ed065f903d7'::uuid,30,'cc0a9b2884be6b06dc8efc1917f9548e',170),
('f45f9fda-4ddb-40ed-8ac3-fc17ca0b4df9'::uuid,'85ad632b-d5f9-48c3-aee4-b8c591a7129a'::uuid,32,'6c49b69f4b1cb91765215a65d4b66c41',171),
('5d4a02e8-fae4-41e0-919c-f58905b5cd2c'::uuid,'cbb1e684-26f7-4927-8d72-c9a8c0bf6699'::uuid,29,'5cf9a7b9942039c702401bbbc5ea49ce',172),
('d7106a25-7264-46e1-b2d3-96f7289002af'::uuid,'52d51f7d-befc-4e29-b0ef-322f169ed31e'::uuid,32,'d26352880558a219ec43ab39aaf3ea3b',175),
('532d0645-56b0-481d-96c5-4e1af13d07a3'::uuid,'d4b8b005-6b5f-4f79-82be-465de70b6dd5'::uuid,32,'73ce39dc6135e19aa0bea4e7cef134fe',176),
('4e838dae-4562-4381-b7f5-4d18ba69eb69'::uuid,'7e3c1cbb-3302-4ff2-bc1b-1219ac654109'::uuid,30,'626bd18a8ca94ce50aca5a6229bade10',180),
('09c48c7b-a5c4-4287-91f7-4049302c2649'::uuid,'4861c61a-58d0-4619-a4aa-c06518c00c20'::uuid,30,'b74151ad8251f499ec7256511781e1b0',181),
('6698c056-ed25-4e0e-a53a-a29dd47de872'::uuid,'19f63850-5bcf-4b5d-bbef-53d7161ada78'::uuid,32,'4e4f75492a399c9061e0700be7cfb9f1',184),
('ce40efe4-37f9-483d-8c70-3d392ad4233a'::uuid,'3f7933a3-5939-4dc4-bc01-6010396f4662'::uuid,32,'18ce11d74c480a2fdf7e4fe98110228d',189)
) v(version_id,suite_id,n_cases,digest,problem_number)
loop
 if not exists(select 1 from public.dsa_problem_versions p where p.id=x.version_id and p.version_number=2) or
 (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id
 then raise exception 'VERSION_MISMATCH %',x.problem_number; end if;
 select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected')
 into n,sig,pub,hid,rejected from public.dsa_test_cases t where t.suite_id=x.suite_id;
 if n<>x.n_cases or sig<>x.digest or pub=0 or hid=0 or rejected<>0 then raise exception 'SNAPSHOT_MISMATCH %',x.problem_number; end if;
 if not exists(select 1 from dsa_execution_private.certification_checks c where c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-oracle-batch7-20261016-v1') then
 select coalesce(max(c.attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks c where c.suite_id=x.suite_id and c.problem_version_id=x.version_id and c.check_name='independent_oracle';
 insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
 values (x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('method','independent_js_oracle','problem_number',x.problem_number,'cases_checked',x.n_cases,'cases_matched',x.n_cases,'fixture_set_digest_md5',x.digest,'scope','fixture_expected_values_only','hosted_execution_verified',false,'contract_certified',false),'[]'::jsonb,'ReasonAI independent JS oracle verifier','independent-js-oracle-batch7-20261016-v1',null);
 end if;
 count_problems:=count_problems+1;
end loop;
if count_problems<>18 then raise exception 'INCOMPLETE_BATCH'; end if;
end $verify$;
