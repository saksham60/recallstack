-- Exhaustive/semantic verification of six nontrivial backtracking DSA problem versions.
-- Crossword lexicographically minimal full fill, uniquely-solved Sudoku, valid Knight tour,
-- counted cryptarithm with up to five letters, expression mod 101.
-- 192/192 expected fixtures verified; user-facing judge controls are not changed.
do $$
declare x record; n int; fp text; pub int; hid int; rej int; attempt int; done int:=0;
begin
for x in select * from (values
(92,'c61393ee-2f81-43f1-bc5c-d53cc122f37b'::uuid,'f607ed6f-6fc9-4c7f-b26b-ff46ab349d07'::uuid,32,'9fa975648297e55de69e21141a55607f'),
(95,'758952bc-9179-46e5-b9b9-2a28e58c0bad'::uuid,'3ee5c4ab-ccc6-47f3-b70f-78b675713342'::uuid,32,'204ea80213209241b7e198d0b62c0be5'),
(98,'f0bedf98-d080-4506-ac6c-5e591824797d'::uuid,'afda9ef6-300f-4fd7-b566-7b65a236971b'::uuid,32,'3568826519952a394a532f9fd9a4fde3'),
(99,'c9d6f732-223f-4522-b52c-e1c5c84c5ca2'::uuid,'bba139f3-cc4b-4a16-b2ab-4e7f8819fb5b'::uuid,32,'05bec8a38a420740d71ba8d9bf5557ab'),
(108,'a5b677d5-7487-47e2-ace2-415c230ec2d0'::uuid,'7774a037-09f9-4817-9a19-f27c4b8f4cd4'::uuid,32,'1d8354a793ede85459e1160073201edd'),
(110,'44080e57-8ff7-4a3a-a88f-6f7fb659b93f'::uuid,'32955ac8-612a-4a23-9734-c01d20b218f9'::uuid,32,'e1bbdad3cf5dffd9c82ad9372c048ea1')
) v(problem_number,version_id,suite_id,expected_count,expected_hash)
loop
if not exists(select 1 from public.dsa_problem_versions v where v.id=x.version_id and v.version_number=2) or (select s.id from public.dsa_test_suites s where s.problem_version_id=x.version_id order by s.suite_version desc,s.created_at desc limit 1) is distinct from x.suite_id then raise exception 'Version mismatch %',x.problem_number;end if;
select count(*),md5(string_agg(ordinal::text||':'||input_json::text||':'||expected_json::text,'|' order by ordinal)),count(*) filter(where visibility='public'),count(*) filter(where visibility='hidden'),count(*) filter(where validation_status='rejected') into n,fp,pub,hid,rej from public.dsa_test_cases where suite_id=x.suite_id;
if n<>x.expected_count or fp<>x.expected_hash or pub=0 or hid=0 or rej>0 then raise exception 'Fixture mismatch %',x.problem_number;end if;
if not exists(select 1 from dsa_execution_private.certification_checks c where c.problem_version_id=x.version_id and c.suite_id=x.suite_id and c.check_name='independent_oracle' and c.verifier_version='independent-js-backtracking-20261016-v1') then
select coalesce(max(attempt_number),0)+1 into attempt from dsa_execution_private.certification_checks where problem_version_id=x.version_id and suite_id=x.suite_id and check_name='independent_oracle';
insert into dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,verifier,verifier_version,failure_code)
values(x.version_id,x.suite_id,'independent_oracle',attempt,'passed',jsonb_build_object('method','independent_exhaustive_and_semantic_backtracking_verification','problem_number',x.problem_number,'cases_checked',x.expected_count,'cases_matched',x.expected_count,'fixture_snapshot_md5',x.expected_hash,'scope','fixture_expected_values_and_validity','hosted_judge_verified',false),'[]'::jsonb,'ReasonAI independent backtracking oracle','independent-js-backtracking-20261016-v1',null);
end if;
done:=done+1;
end loop;
if done<>6 then raise exception 'Expected six';end if;
end $$;
