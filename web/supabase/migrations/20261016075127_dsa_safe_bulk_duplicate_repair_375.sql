
-- ReasonAI DSA safe bulk duplicate repair (all current problems).
-- Idempotent, additive and one transaction. Does NOT grant Submit eligibility.
-- Keeps old fixtures and certificates intact; no hidden fixture data exposed.
DO $dsa_repair$
DECLARE
 src record;
 new_suite_id uuid;
 observed_total integer;
 observed_unique integer;
 migrated_count integer := 0;
 migrated_cases integer := 0;
 dropped_duplicates integer := 0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('reasonai_dsa_bulk_safe_repair_v1',0));
 FOR src IN
   SELECT
     s.id source_suite_id,
     s.problem_version_id,
     s.suite_version,
     s.checker_type,
     s.oracle_metadata,
     a.total_cases,
     a.unique_inputs,
     a.rejected_cases
   FROM public.dsa_test_suites s
   JOIN LATERAL (
     SELECT count(*)::integer total_cases,
            count(distinct t.input_json)::integer unique_inputs,
            count(*) filter(where t.validation_status='rejected')::integer rejected_cases
     FROM public.dsa_test_cases t WHERE t.suite_id=s.id
   ) a ON true
   WHERE s.status='needs_review'
     AND a.total_cases>a.unique_inputs
     AND s.suite_version=(
       SELECT max(newer.suite_version)
       FROM public.dsa_test_suites newer
       WHERE newer.problem_version_id=s.problem_version_id
     )
     AND EXISTS (
       SELECT 1 FROM public.dsa_problem_definitions def
       WHERE def.current_version_id=s.problem_version_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM dsa_execution_private.certificates c
       WHERE c.problem_version_id=s.problem_version_id
         AND c.revoked_at IS NULL AND c.hidden_submit_approved
     )
   ORDER BY s.problem_version_id,s.id
 LOOP
   -- If duplicates have conflicting expected answers, don't silently pick one.
   IF EXISTS (
     SELECT 1 FROM public.dsa_test_cases t
     WHERE t.suite_id=src.source_suite_id
     GROUP BY t.input_json
     HAVING count(distinct t.expected_json)>1
   ) THEN
     RAISE EXCEPTION 'Conflicting expected outputs; refusing suite %',src.source_suite_id;
   END IF;
   -- No automatic certification or fixture verification. New suite stays in review.
   INSERT INTO public.dsa_test_suites (
     problem_version_id,suite_version,checker_type,status,oracle_metadata
   ) VALUES (
     src.problem_version_id,src.suite_version+1,src.checker_type,'needs_review',
     src.oracle_metadata || jsonb_build_object(
       'repair_kind','duplicate_input_dedup',
       'repair_version','safe_batch_v1_20261016',
       'source_suite_id',src.source_suite_id,
       'source_suite_version',src.suite_version,
       'source_fixtures',src.total_cases,
       'uniquely_preserved_inputs',src.unique_inputs,
       'duplicate_rows_removed',src.total_cases-src.unique_inputs,
       'independent_oracle_verified',false,
       'source_contract_verified',false,
       'provider_verified',false,
       'judge_ready',false,
       'publish_approved',false
     )
   ) RETURNING id INTO new_suite_id;

   WITH ranked AS (
     SELECT t.*,
            row_number() OVER (
              PARTITION BY t.input_json
              ORDER BY
                CASE WHEN t.visibility='public' THEN 0 ELSE 1 END,
                CASE t.validation_status
                  WHEN 'verified' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
                t.ordinal,t.id
            ) as duplicate_rank
     FROM public.dsa_test_cases t
     WHERE t.suite_id=src.source_suite_id
   ), unique_cases AS (
     SELECT ranked.*,
            (row_number() OVER (ORDER BY ranked.ordinal,ranked.id)-1)::integer new_ordinal
     FROM ranked WHERE duplicate_rank=1
   )
   INSERT INTO public.dsa_test_cases(
     suite_id,ordinal,category,visibility,input_json,expected_json,
     fixture_ref,validation_status,provenance
   )
   SELECT new_suite_id,u.new_ordinal,u.category,u.visibility,u.input_json,
          u.expected_json,u.fixture_ref,
          'pending', -- crucial: copied fixtures are NOT assumed verified
          u.provenance || jsonb_build_object(
            'repair_source_case_id',u.id::text,
            'repair_source_suite_id',src.source_suite_id::text,
            'repair_status','needs_independent_certification',
            'provider_verified',false
          )
   FROM unique_cases u;

   SELECT count(*)::integer,count(distinct input_json)::integer
   INTO observed_total,observed_unique
   FROM public.dsa_test_cases WHERE suite_id=new_suite_id;

   IF observed_total<>src.unique_inputs OR observed_unique<>observed_total THEN
     RAISE EXCEPTION 'Suite % repaired copy validation failed',src.source_suite_id;
   END IF;

   INSERT INTO dsa_execution_private.certification_reviews(
     problem_version_id,suite_id,workflow_status,blocker_summary
   ) VALUES(
     src.problem_version_id,new_suite_id,'in_progress',
     format('Duplicate-input repair complete: removed %s copies; %s distinct inputs preserved. Independent oracle, contract, checker and hosted judge validation still required.',
       src.total_cases-src.unique_inputs,src.unique_inputs)
   );

   INSERT INTO dsa_execution_private.certification_checks (
     problem_version_id,suite_id,check_name,attempt_number,result,evidence,
     source_references,verifier,verifier_version,failure_code
   ) VALUES (
     src.problem_version_id,new_suite_id,'fixture_integrity',1,'blocked',
     jsonb_build_object(
       'structural_duplicate_check','passed',
       'original_suite_id',src.source_suite_id,
       'original_total',src.total_cases,
       'preserved_unique',src.unique_inputs,
       'removed_duplicate_copies',src.total_cases-src.unique_inputs,
       'source_expected_values_conflicted',false,
       'independent_oracle_checked',false,
       'fixture_validation_status','pending',
       'hidden_inputs_exposed',false),
     jsonb_build_array(jsonb_build_object('artifact','dsa_test_suites',
       'source_suite_id',src.source_suite_id,'new_suite_id',new_suite_id)),
     'ReasonAI structural repair SQL','safe_batch_v1_20261016',
     'ORACLE_AND_HOSTED_JUDGE_NOT_VERIFIED'
   );

   migrated_count:=migrated_count+1;
   migrated_cases:=migrated_cases+observed_total;
   dropped_duplicates:=dropped_duplicates+src.total_cases-src.unique_inputs;
 END LOOP;

 RAISE NOTICE 'safe_dsa_repair_complete suites=% copied_cases=% removed_duplicate_copies=%; newly_certified=0',
   migrated_count,migrated_cases,dropped_duplicates;
END
$dsa_repair$;
