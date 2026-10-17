-- Independent JS algorithm validation: 20 advanced DSA problems / 608 fixtures.
-- Balanced binary-tree counter compared using exact BigInt modular arithmetic.
-- Only records immutable-snapshot-scoped output evidence, no hosted judge approval.
do $batch$
declare x record; cnt int; fingerprint text; pub int; hidden int; rej int; seq int; verified int:=0;
begin
for x in select * from (values
(273,'a9814eb6-150b-4e16-9da9-8b57a65bb232'::uuid,'55545308-6599-4796-b63a-15a1d0741992'::uuid,32,'6d41d890b7693f013dd62ff54521b43e'),
(278,'28ba5952-3501-4440-b83f-356001689a96'::uuid,'7faa066d-e806-40c9-bb59-9fc450765392'::uuid,32,'d2e368e7a44d47aa610a5e5760168864'),
(290,'66a377cf-6738-48a2-8da9-a2954c99f512'::uuid,'5b763109-b686-488c-92de-5d80f7ea7fc6'::uuid,30,'57819cdf3e6033ecd6b71f92e5f1abda'),
(294,'d960d74c-6819-477a-8aae-c6e2d14bf22b'::uuid,'fed5c6fd-96bb-4c8b-91d6-6b4a74c7d059'::uuid,32,'bfef6226885a0eedd89196df96fc267f'),
(299,'ef50cff4-1af0-4431-8e2c-b9fdf1d724ec'::uuid,'cf9038f4-8866-4985-927c-b9ce9002113a'::uuid,30,'9c3774ad7a00be78b739b129acf9849c'),
(301,'e8669d54-b40f-4f91-bf8c-f3c05973296c'::uuid,'3b4f5803-e6b7-4d47-a96f-659823591839'::uuid,32,'981013bd3143fa00a5060e94893e505e'),
(302,'2dce1317-acae-4b9a-9fab-6a9556a733be'::uuid,'a563ce3e-2f57-41b9-8785-db8dfd3b5c6a'::uuid,30,'cb5aa088c88a2f9b25f9a94afa246d6c'),
(305,'650681f2-cdd2-4aeb-9118-ad7e8748e89b'::uuid,'e7516a9b-ac29-4f59-b7d1-e2becb3c703d'::uuid,24,'96d75c8924e1bd0c88f9699c0b5975e7'),
(306,'401afd20-151e-4e29-8deb-e2cdf6cfe136'::uuid,'6b68dace-7831-4431-8041-9963ca2b6d21'::uuid,32,'af62e971798228abfcb08fa8bb9a8a97'),
(307,'bebea0ec-3c10-4c1b-9818-4dd8368ca5cb'::uuid,'d70b57a5-8b6b-4bc1-ab04-30a646c6b313'::uuid,32,'950322c98233d3b2d87e8671aadcd1be'),
(308,'9fc981b9-a7da-4267-b005-af509c6656ef'::uuid,'8055c078-f3c1-4dfd-bec9-e32266e5ea7f'::uuid,32,'fc004c80ca9d5f47d06e2e171bfe5a60'),
(309,'8cfcd132-2f84-4259-903d-fdd28a2f2b71'::uuid,'657c2cda-abde-4c75-a52b-91e3cdef62c8'::uuid,29,'57b9c81fd82c09e9c9f944340e340417'),
(311,'968096e0-3678-4192-ac04-4899ed49d595'::uuid,'a93adf48-0230-44a0-ab8e-8c464893d487'::uuid,32,'c59f060cb1f2c964af11201c3852bb6a'),
(312,'67b107b2-0c37-4ddf-9b4a-4bea8e5206ec'::uuid,'0a75c47f-7ab2-4aca-9b7e-74f468f27d6e'::uuid,30,'ff711247d0108ba5cc4ec75c8ba5eb68'),
(315,'b20c66f7-be49-4c67-ab0d-0efffeee1604'::uuid,'eea47aec-0132-4bd1-a6fe-29e6868ce632'::uuid,27,'02800bcee46449bde0a4b5077f4d37f0'),
(316,'903c1dde-ddf5-4f1c-a9d5-89328487142d'::uuid,'c2a96a71-3ad3-4eb3-b66d-fe4774645a0e'::uuid,28,'ea24ac0ed5328f6e0f0e35cd547810ca'),
(318,'a47acfb7-efea-4424-b18b-03213f7bdd91'::uuid,'f535713c-c6c6-45c5-9ae4-1ade8de61111'::uuid,28,'9d3eb3be13bc1feb5e2ef8ec08b9af32'),
(333,'3739834b-ca51-4d7c-8251-a9f195883fea'::uuid,'0a58d6db-4e48-4f3b-92fb-31f631b5f13e'::uuid,32,'efa2c4360cf19431cc0a0dcfcc154ca2'),
(339,'c171601c-8335-4c66-895b-d8481f4d7f2f'::uuid,'df685494-3a46-4fc4-9a20-11ef5e40b098'::uuid,32,'e306f1417b01141a60fb7a68997d4799'),
(357,'28f19a2e-b2f8-4588-9502-b782b6f7da99'::uuid,'408fe183-1e60-45ea-8427-a17d75266136'::uuid,32,'d1e91b2b41d980ef30b08ce8438b5189')
) as v(problem_number,version_id,suite_id,expected_count,expected_hash)
loop
 if not exists(select 1 from public.dsa_problem_versions p where p.id=x.version_id and p.version_number=2)
 or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id
 then raise exception 'Suite has changed for %',x.problem_number;end if;
 select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),
 count(*) filter(where t.visibility='public'),count(*) filter(where t.visibility='hidden'),count(*) filter(where t.validation_status='rejected')
 into cnt,fingerprint,pub,hidden,rej from public.dsa_test_cases t where t.suite_id=x.suite_id;
 if cnt<>x.expected_count or fingerprint<>x.expected_hash or pub=0 or hidden=0 or rej<>0
 then raise exception 'Fixture snapshot differs for %',x.problem_number;end if;
 if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-special-batch12-20261016-v1') then
 select coalesce(max(c.attempt_number),0)+1 into seq from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle';
 insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
 values(x.version_id,x.suite_id,'independent_oracle',seq,'passed',jsonb_build_object('method','independent_js_specialized_algorithms','problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_hash,'scope','fixture_outputs_only','source_contract_verified',false,'hosted_provider_verified',false),'[]'::jsonb,'ReasonAI independent JS advanced verifier','independent-js-special-batch12-20261016-v1',null);
 end if;
 verified:=verified+1;
end loop;
if verified<>20 then raise exception 'Expected 20 verified suites';end if;
end $batch$;
