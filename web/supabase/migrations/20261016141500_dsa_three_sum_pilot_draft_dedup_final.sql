
-- Repair only newly authored, uncertified 3Sum v2 pilot cases; keep original v1 immutable.
do $$
declare v_suite uuid;v_duplicates integer;v_count integer;
begin
 select id into v_suite from public.dsa_test_suites
 where problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469'
 and suite_version=2 and status='needs_review' for update;
 if v_suite is null then raise exception 'EXPECTED_UNPUBLISHED_THREESUM_V2';end if;
 select count(*) into v_count from public.dsa_test_cases where suite_id=v_suite;
 select count(*) into v_duplicates from public.dsa_test_cases newer
 where newer.suite_id=v_suite and newer.ordinal>=30 and
 newer.provenance->>'source'='reasonai_authored_pilot' and
 exists(select 1 from public.dsa_test_cases older
 where older.suite_id=v_suite and older.ordinal<newer.ordinal
 and older.input_json=newer.input_json);
 if v_count<>36 or v_duplicates<>2 then
  raise exception 'UNEXPECTED_PILOT_STATE total=% duplicate_authored=%',v_count,v_duplicates;end if;
 delete from public.dsa_test_cases newer where newer.suite_id=v_suite
 and newer.ordinal>=30 and newer.provenance->>'source'='reasonai_authored_pilot'
 and exists(select 1 from public.dsa_test_cases older where older.suite_id=v_suite
  and older.ordinal<newer.ordinal and older.input_json=newer.input_json);
end $$;
with incoming(ordinal,inp,expected) as(values (36,'{"values":[100,-50,-50,0,0]}'::jsonb,'[[-50,-50,100]]'::jsonb),
(37,'{"values":[-13,-7,-2,0,1,2,5,7,9,11,13]}'::jsonb,'[[-13,0,13],[-13,2,11],[-7,-2,9],[-7,0,7],[-7,2,5],[-2,0,2]]'::jsonb))
insert into public.dsa_test_cases(suite_id,ordinal,category,visibility,input_json,expected_json,provenance,validation_status)
select s.id,a.ordinal,'edge','hidden',a.inp,a.expected,
 jsonb_build_object('source','reasonai_authored_pilot','oracle','exhaustive_triplets_js',
   'independent_cross_check',true,'provider_verified',false),'pending'
from incoming a join public.dsa_test_suites s on
 s.problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and s.suite_version=2
where not exists(select 1 from public.dsa_test_cases t where t.suite_id=s.id and t.input_json=a.inp);
-- Assert no remaining duplicate input or public-hidden overlap before recording audit result.
do $$
declare v_suite uuid;v_count int;v_unique int;
begin
 select id into v_suite from public.dsa_test_suites where
 problem_version_id='62b831b6-4c58-438e-9442-a78be83e3469' and suite_version=2;
 select count(*),count(distinct input_json) into v_count,v_unique
 from public.dsa_test_cases where suite_id=v_suite;
 if v_count<>36 or v_unique<>36 then
  raise exception 'PILOT_V2_STILL_HAS_DUPLICATES: total % unique %',v_count,v_unique;end if;
 insert into dsa_execution_private.certification_checks(
  problem_version_id,suite_id,check_name,attempt_number,result,evidence,
  source_references,verifier,verifier_version)
 values('62b831b6-4c58-438e-9442-a78be83e3469',v_suite,
  'fixture_integrity',1,'passed',
  jsonb_build_object('total_cases',v_count,'unique_inputs',v_unique,'status','draft_only',
   'fixture_validation','pending','production_eligible',false),
  '[{"artifact":"dsa_test_cases","suite_version":2}]',
  'ReasonAI independent verifier','postgres-duplicate-check-20261016');
end $$;
