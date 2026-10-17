-- Eight independently verified exact-integer review suites; 246/246 fixtures matched.
-- Source versions retained, no grading flags, publication approvals, or hosted certification.
do $verify$
declare x record; actual_count int; actual_hash text; public_count int; hidden_count int; rejected_count int; attempt int; done int:=0;
begin
for x in select * from (values
(12,'46daa15f-6021-449c-b339-ac16cadb11ca'::uuid,'38ca22e4-d962-440a-897f-2c9d65e349c2'::uuid,32,'6d61c3face0ac9d95e2d0f89076a1b8b'),
(78,'f4264291-8511-4943-98be-15ab34da0515'::uuid,'5a1c7672-acb2-4918-98d9-3d5b7709cb07'::uuid,31,'861c806a3f78899cec1434cc1db17dea'),
(336,'a15bd1c1-aaca-46b3-8a33-a83cc6557e15'::uuid,'32b1c509-e732-464d-8b4b-5f4ce7c5c7d6'::uuid,28,'a5e7919f99069d999513ae6cb892e3f0'),
(337,'e13f01b3-9795-4d6e-9b45-28ef71f0c58f'::uuid,'86402052-1b02-4f2f-9213-201e5f7dc598'::uuid,30,'507339c25faf7474ffa9b42c72690a43'),
(353,'7b9247ae-28cf-474e-b8f8-c76454adb861'::uuid,'7d370794-1343-40bb-b620-d9fbc113641e'::uuid,32,'75b19d4ed8bc8222588ae652d501b3f6'),
(388,'1e90d4a3-d6ff-413f-9c4d-9817e96a4479'::uuid,'bb90dc1f-eff2-4cd6-9aae-14d60ea584f2'::uuid,31,'aa6ad3dd0c606ca2bcd05ebd939f1c5f'),
(390,'23e2f753-66d7-4e29-abce-d85ac7c9ba52'::uuid,'4a981a1e-d548-43bb-8318-8dfed5182efe'::uuid,30,'26015f9cc2fd17d7da97b69742f51af6'),
(391,'72d9546c-a4aa-4c4d-8108-7c9f2deb9730'::uuid,'ee4805ed-9b60-48d9-9352-faa9c96e5232'::uuid,32,'24eb52845db0c5ee854683fb073af2b1')
) as v(problem_number,version_id,suite_id,expected_count,expected_md5)
loop
if not exists(select 1 from public.dsa_problem_versions p where p.id=x.version_id and p.version_number=2)
or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id then raise exception 'Source changed %',x.problem_number;end if;
select count(*),md5(string_agg(t.ordinal::text||':'||t.input_json::text||':'||t.expected_json::text,'|' order by t.ordinal)),
count(*) filter(where t.visibility='public'),count(*) filter(where t.visibility='hidden'),count(*) filter(where t.validation_status='rejected')
into actual_count,actual_hash,public_count,hidden_count,rejected_count from public.dsa_test_cases t where t.suite_id=x.suite_id;
if actual_count<>x.expected_count or actual_hash<>x.expected_md5 or public_count=0 or hidden_count=0 or rejected_count>0 then raise exception 'Fixture snapshot invalid %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='exact-js-bigint-repaired-suites-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',
jsonb_build_object('method','independent_exact_bigint_oracle_and_lossless_postgres_numeric','problem_number',x.problem_number,
'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_md5,
'scope','review_suite_fixture_expected_values','lossless_decimal_inputs_checked',true,
'old_source_immutable',true,'hosted_judge_verified',false,'javascript_safe_integer_transport_verified',false),
'[]'::jsonb,'ReasonAI independent exact BigInt verifier','exact-js-bigint-repaired-suites-20261016-v1',null);
end if;
update public.dsa_test_suites set oracle_metadata=oracle_metadata||jsonb_build_object('independent_oracle_verified',true,'exact_numeric_recheck','passed','verified_cases',x.expected_count,'verified_snapshot_md5',x.expected_md5,'provider_verified',false,'judge_ready',false,'publish_approved',false) where id=x.suite_id;
done:=done+1;
end loop;
if done<>8 then raise exception 'Expected 8 suites';end if;
end $verify$;
