
-- 3Sum pilot: copy only the 30 UNIQUE original inputs to a NEW, non-eligible suite.
-- Validation stays pending until independently checked and actual Nebius adapter E2E passes.
insert into public.dsa_test_suites(problem_version_id,suite_version,checker_type,status,oracle_metadata)
values('62b831b6-4c58-438e-9442-a78be83e3469',2,'exact','needs_review',
 jsonb_build_object('source_suite_id','6b70f01f-31cc-43d1-bd1e-752aea84453d','pilot','20261016','provider_verified',false,
   'review_required',true,'reason','deduplicate public/hidden overlap and add authored edge/stress fixtures'));
with chosen as (
 select t.*,
 row_number()over(partition by t.input_json order by
  case when t.visibility='public' then 0 else 1 end,t.ordinal) as duplicate_rank
 from public.dsa_test_cases t where t.suite_id='6b70f01f-31cc-43d1-bd1e-752aea84453d'
), numbered as (
 select t.*,row_number()over(order by t.ordinal,t.id)-1 as new_ordinal
 from chosen t where t.duplicate_rank=1
)
insert into public.dsa_test_cases(suite_id,ordinal,category,visibility,input_json,expected_json,provenance,validation_status)
select s.id,n.new_ordinal,n.category,n.visibility,n.input_json,n.expected_json,
 n.provenance||jsonb_build_object('repair','deduplicated_copy','original_fixture_id',n.id::text,
  'provider_verified',false),
 'pending'
from numbered n cross join public.dsa_test_suites s
where s.problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and s.suite_version=2;
with authored(idx,inp,expected,visibility,category) as (
 values (0,'{"values":[-1,0,1,2,-1,-4]}'::jsonb,'[[-1,-1,2],[-1,0,1]]'::jsonb,'public','edge'),
(1,'{"values":[0,0,0,0,0,0]}'::jsonb,'[[0,0,0]]'::jsonb,'public','edge'),
(2,'{"values":[-2,0,0,2,2]}'::jsonb,'[[-2,0,2]]'::jsonb,'hidden','edge'),
(3,'{"values":[-10000,-9999,-1,0,1,9999,10000]}'::jsonb,'[[-10000,0,10000],[-10000,1,9999],[-9999,-1,10000],[-9999,0,9999],[-1,0,1]]'::jsonb,'hidden','edge'),
(4,'{"values":[5,8,-3,-5,-8,3,0,0,0,-1,1]}'::jsonb,'[[-8,0,8],[-8,3,5],[-5,-3,8],[-5,0,5],[-3,0,3],[-1,0,1],[0,0,0]]'::jsonb,'hidden','edge'),
(5,'{"values":[-15,2,-12,5,-9,8,-6,11,-3,14,0,-14,3,-11,6,-8,9,-5,12,-2,15,1,-13,4,-10,7,-7,10,-4,13,-1,-15,2,-12,5,-9,8,-6,11,-3,14,0,-14,3,-11,6,-8,9,-5,12,-2,15,1,-13,4,-10,7,-7,10,-4]}'::jsonb,'[[-15,0,15],[-15,1,14],[-15,2,13],[-15,3,12],[-15,4,11],[-15,5,10],[-15,6,9],[-15,7,8],[-14,-1,15],[-14,0,14],[-14,1,13],[-14,2,12],[-14,3,11],[-14,4,10],[-14,5,9],[-14,6,8],[-14,7,7],[-13,-2,15],[-13,-1,14],[-13,0,13],[-13,1,12],[-13,2,11],[-13,3,10],[-13,4,9],[-13,5,8],[-13,6,7],[-12,-3,15],[-12,-2,14],[-12,-1,13],[-12,0,12],[-12,1,11],[-12,2,10],[-12,3,9],[-12,4,8],[-12,5,7],[-12,6,6],[-11,-4,15],[-11,-3,14],[-11,-2,13],[-11,-1,12],[-11,0,11],[-11,1,10],[-11,2,9],[-11,3,8],[-11,4,7],[-11,5,6],[-10,-5,15],[-10,-4,14],[-10,-3,13],[-10,-2,12],[-10,-1,11],[-10,0,10],[-10,1,9],[-10,2,8],[-10,3,7],[-10,4,6],[-10,5,5],[-9,-6,15],[-9,-5,14],[-9,-4,13],[-9,-3,12],[-9,-2,11],[-9,-1,10],[-9,0,9],[-9,1,8],[-9,2,7],[-9,3,6],[-9,4,5],[-8,-7,15],[-8,-6,14],[-8,-5,13],[-8,-4,12],[-8,-3,11],[-8,-2,10],[-8,-1,9],[-8,0,8],[-8,1,7],[-8,2,6],[-8,3,5],[-8,4,4],[-7,-7,14],[-7,-6,13],[-7,-5,12],[-7,-4,11],[-7,-3,10],[-7,-2,9],[-7,-1,8],[-7,0,7],[-7,1,6],[-7,2,5],[-7,3,4],[-6,-6,12],[-6,-5,11],[-6,-4,10],[-6,-3,9],[-6,-2,8],[-6,-1,7],[-6,0,6],[-6,1,5],[-6,2,4],[-6,3,3],[-5,-5,10],[-5,-4,9],[-5,-3,8],[-5,-2,7],[-5,-1,6],[-5,0,5],[-5,1,4],[-5,2,3],[-4,-4,8],[-4,-3,7],[-4,-2,6],[-4,-1,5],[-4,0,4],[-4,1,3],[-4,2,2],[-3,-3,6],[-3,-2,5],[-3,-1,4],[-3,0,3],[-3,1,2],[-2,-2,4],[-2,-1,3],[-2,0,2],[-2,1,1],[-1,0,1]]'::jsonb,'hidden','performance')
)
insert into public.dsa_test_cases(suite_id,ordinal,category,visibility,input_json,expected_json,provenance,validation_status)
select s.id,30+a.idx,a.category,a.visibility,a.inp,a.expected,
 jsonb_build_object('source','reasonai_authored_pilot','oracle','exhaustive_triplets_js',
  'oracle_independently_rechecked',true,'provider_verified',false),'pending'
from authored a cross join public.dsa_test_suites s
where s.problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and s.suite_version=2;
insert into dsa_execution_private.certification_reviews(problem_version_id,suite_id,workflow_status,blocker_summary)
select '62b831b6-4c58-438e-9442-a78be83e3469',id,'in_progress',
 'Pending Python adapter + hosted Nebius judge E2E, provenance review, fixture stress validation'
from public.dsa_test_suites where problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and suite_version=2;
-- Retain audit history for the original suite; do not modify its 32 rows.
insert into dsa_execution_private.certification_checks(
 problem_version_id,suite_id,check_name,attempt_number,result,evidence,source_references,
 verifier,verifier_version,failure_code)
values
('62b831b6-4c58-438e-9442-a78be83e3469','6b70f01f-31cc-43d1-bd1e-752aea84453d','independent_oracle',1,'passed',
 '{"fixtures_checked":32,"matching":32,"method":"exhaustive triple enumeration O(n^3)","expected_data_exposed":false}',
 '[{"artifact":"dsa_test_cases","suite_version":1}]','ReasonAI independent verifier','js-bruteforce-20261016',null),
('62b831b6-4c58-438e-9442-a78be83e3469','6b70f01f-31cc-43d1-bd1e-752aea84453d','fixture_integrity',1,'failed',
 '{"cases_checked":32,"overlapping_hidden_inputs":2,"unique_inputs":30,"hidden_payloads_exposed":false}',
 '[{"artifact":"dsa_test_cases","suite_version":1}]','ReasonAI independent verifier','js-bruteforce-20261016','PUBLIC_HIDDEN_OVERLAP');
update dsa_execution_private.certification_reviews
set workflow_status='blocked',blocker_summary='v1 has two public/hidden duplicated inputs; v2 draft awaiting E2E',updated_at=now()
where problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and suite_id='6b70f01f-31cc-43d1-bd1e-752aea84453d';
