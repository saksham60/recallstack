-- Exact decimal-value independent audit for 10 DSA v2 bigint/problem versions.
-- Five suites passed 150/150 fixtures. Five suites show precision-drift disagreements
-- between stored JSON numbers and mathematically exact BigInt oracles.
-- Blocks disputed suites pending lossless integer serialization and versioned correction.
do $$
declare x record; n int; hash_now text; visible int; hidden int; rejected int; attempt int; processed int:=0;
begin
for x in select * from (values
(336,'a15bd1c1-aaca-46b3-8a33-a83cc6557e15'::uuid,'26e57474-493b-4d5c-98fb-046cd9f6f31c'::uuid,28,'f9c7cdcc0119a8bf88c4e0f4f7f50a57',4),
(337,'e13f01b3-9795-4d6e-9b45-28ef71f0c58f'::uuid,'0857b140-ff6a-4f91-80f3-d30b8f96acc2'::uuid,30,'7d5605a8a1591eefb7af72e51a16e742',8),
(353,'7b9247ae-28cf-474e-b8f8-c76454adb861'::uuid,'dd9e0e27-0593-4a37-a7f2-0080b74212df'::uuid,32,'cda30f2cd2da10d748c9737df0dd6569',6),
(379,'2fcb7a52-ed54-426f-9d5e-1f919cc1d2b2'::uuid,'2323e114-675f-4d1f-9311-29eb6a8f6843'::uuid,22,'c673d42eaa8babe0b4aa83cb379130f9',0),
(388,'1e90d4a3-d6ff-413f-9c4d-9817e96a4479'::uuid,'d112aade-d7c0-4422-8bda-8956b73f84b0'::uuid,31,'ce025c27e23f0948a0579937d9506d95',5),
(391,'72d9546c-a4aa-4c4d-8108-7c9f2deb9730'::uuid,'eae0958b-afc9-4909-9ae8-2de9c2efc8b7'::uuid,32,'563fe211d89d97fdb8306ec1d70ab67a',3),
(393,'6c062539-60e8-48af-bbe3-f06ea18dd195'::uuid,'82fef565-0d7a-48e3-821d-954363892973'::uuid,32,'a950ae7dc2b9701208ca102a2651a5e8',0),
(394,'7687478f-d636-4c59-a3b1-c35714b10464'::uuid,'d76b0b04-9cd9-4c87-b146-b278f37adf33'::uuid,32,'a6404892af555fa83189cd7517ddf3ce',0),
(395,'21498af8-eb51-406b-992b-f02764ac2fd6'::uuid,'03cd4f58-110d-476a-8a03-63ce253d5c14'::uuid,32,'7a007dfb9a74676c11bde298ce58fedd',0),
(396,'0bcf8624-1b92-41ee-876e-dd622393d33f'::uuid,'56842a6d-258f-4726-952a-e7529a7e830a'::uuid,32,'b1950f537dfdc3bc09662cef784a8c84',0)
) as z(problem_number,version_id,suite_id,expected_count,expected_hash,mismatch_count)
loop
if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2)
or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id then raise exception 'Wrong version %',x.problem_number;end if;
select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected') into n,hash_now,visible,hidden,rejected from public.dsa_test_cases where suite_id=x.suite_id;
if n<>x.expected_count or hash_now<>x.expected_hash or visible=0 or hidden=0 or rejected>0 then raise exception 'Fixture changed %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-exact-biginteger-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(x.version_id,x.suite_id,'independent_oracle',attempt,case when x.mismatch_count=0 then 'passed' else 'blocked' end,
jsonb_build_object('method','exact_integer_bigint_oracle','problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count-x.mismatch_count,'mismatches',x.mismatch_count,'fixture_snapshot_md5',x.expected_hash,'scope','exact_fixture_output_correctness','lossless_integer_transport_review_required',x.mismatch_count>0,'hosted_judge_verified',false),
'[]'::jsonb,'ReasonAI independent exact integer verifier','independent-js-exact-biginteger-20261016-v1',
case when x.mismatch_count=0 then null else 'EXACT_INTEGER_FIXTURE_PRECISION_DRIFT' end);
end if;
processed:=processed+1;
end loop;
if processed<>10 then raise exception 'Expected ten suites';end if;
end $$;
