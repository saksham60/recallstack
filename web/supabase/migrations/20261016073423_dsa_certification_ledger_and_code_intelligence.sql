
-- ReasonAI DSA certification audit + versioned Code Intelligence. No judge eligibility flags changed.
create table dsa_execution_private.certification_checks (
 id uuid primary key default gen_random_uuid(),
 problem_version_id uuid not null references public.dsa_problem_versions(id),
 suite_id uuid not null references public.dsa_test_suites(id),
 check_name text not null check(check_name in (
   'statement_contract','independent_oracle','fixture_integrity',
   'edge_negative_stress','checker_semantics','public_execution',
   'hidden_execution','nebius_python_e2e')),
 attempt_number integer not null check(attempt_number between 1 and 100000),
 result text not null check(result in ('passed','failed','blocked')),
 evidence jsonb not null default '{}'::jsonb
   check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=32768),
 source_references jsonb not null default '[]'::jsonb
   check(jsonb_typeof(source_references)='array' and octet_length(source_references::text)<=8192),
 verifier text not null check(char_length(btrim(verifier)) between 2 and 160),
 verifier_version text not null check(char_length(btrim(verifier_version)) between 1 and 160),
 failure_code text check(failure_code is null or length(failure_code)<=128),
 verified_at timestamptz not null default now(),
 unique(problem_version_id,suite_id,check_name,attempt_number),
 check(result='passed' or failure_code is not null)
);
create index dsa_certification_checks_latest_idx
 on dsa_execution_private.certification_checks(problem_version_id,suite_id,check_name,verified_at desc,id desc);
create table dsa_execution_private.certification_reviews (
 problem_version_id uuid not null references public.dsa_problem_versions(id),
 suite_id uuid not null references public.dsa_test_suites(id),
 workflow_status text not null default 'awaiting_review'
  check(workflow_status in ('awaiting_review','in_progress','blocked','ready_for_certificate','certified')),
 blocker_summary text,
 reviewer_id uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 primary key(problem_version_id,suite_id)
);
create index dsa_certification_reviews_status_idx on dsa_execution_private.certification_reviews(workflow_status,updated_at);
alter table dsa_execution_private.certification_checks enable row level security;
alter table dsa_execution_private.certification_reviews enable row level security;
revoke all on dsa_execution_private.certification_checks,dsa_execution_private.certification_reviews from public,anon,authenticated;
grant select,insert on dsa_execution_private.certification_checks to service_role;
grant select,insert,update on dsa_execution_private.certification_reviews to service_role;

-- Immutable exact-version evidence: insert-only checks. Publishing or issuing a NEW
-- certificate is a separate explicitly reviewed action; these tables never auto-certify.
create function dsa_execution_private.check_certification_gate()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_check text; v_latest text;
begin
 if NEW.hidden_submit_approved and NEW.revoked_at is null and
   (TG_OP='INSERT' or (not OLD.hidden_submit_approved) or OLD.revoked_at is not null
     or OLD.problem_version_id is distinct from NEW.problem_version_id
     or OLD.suite_id is distinct from NEW.suite_id) then
   if not exists (select 1 from public.dsa_test_suites s where s.id=NEW.suite_id
      and s.problem_version_id=NEW.problem_version_id and s.status='published') then
     raise exception 'CERTIFICATION_SUITE_NOT_PUBLISHED' using errcode='23514';
   end if;
   for v_check in select unnest(array[
    'statement_contract','independent_oracle','fixture_integrity',
    'edge_negative_stress','checker_semantics','public_execution',
    'hidden_execution','nebius_python_e2e']::text[]) loop
     select c.result into v_latest from dsa_execution_private.certification_checks c
      where c.problem_version_id=NEW.problem_version_id and c.suite_id=NEW.suite_id
        and c.check_name=v_check order by c.verified_at desc,c.id desc limit 1;
     if v_latest is distinct from 'passed' then
       raise exception 'CERTIFICATION_CHECK_MISSING_OR_FAILED: %',v_check using errcode='23514';
     end if;
   end loop;
 end if;
 return NEW;
end $$;
create trigger dsa_certificate_gate_v2
before insert or update on dsa_execution_private.certificates
for each row execute function dsa_execution_private.check_certification_gate();

create table public.dsa_code_intelligence_reports (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null references dsa_execution_private.jobs(id) on delete restrict,
 report_version integer not null default 1 check(report_version between 1 and 1000),
 user_id uuid not null references auth.users(id) on delete cascade,
 problem_id uuid not null references public.content_items(id),
 problem_version_id uuid not null references public.dsa_problem_versions(id),
 language text not null check(language in ('python')),
 code_sha256 text not null check(code_sha256 ~ '^[0-9a-f]{64}$'),
 source_reference text not null check(length(source_reference)<=160),
 judge_status text not null check(judge_status in ('completed','failed','timed_out','cancelled')),
 verified_verdict text check(verified_verdict in (
   'accepted','passed_public_tests','wrong_answer','runtime_error','syntax_error',
   'time_limit_exceeded','output_limit_exceeded')),
 verified_metrics jsonb not null default '{}'::jsonb
  check(jsonb_typeof(verified_metrics)='object' and octet_length(verified_metrics::text)<=8192),
 assessment jsonb check(assessment is null or
   (jsonb_typeof(assessment)='object' and octet_length(assessment::text)<=65536)),
 generation_status text not null default 'queued'
  check(generation_status in ('queued','generating','completed','failed','skipped')),
 model_id text check(model_id is null or length(model_id)<=160),
 rubric_version text check(rubric_version is null or length(rubric_version)<=80),
 prompt_version text check(prompt_version is null or length(prompt_version)<=80),
 evidence_refs jsonb not null default '[]'::jsonb
  check(jsonb_typeof(evidence_refs)='array' and octet_length(evidence_refs::text)<=8192),
 generation_attempts integer not null default 0 check(generation_attempts between 0 and 30),
 error_code text check(error_code is null or length(error_code)<=128),
 generation_started_at timestamptz,
 generation_completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(submission_id,report_version),
 unique(id,user_id)
);
create index dsa_code_reports_user_latest_idx on public.dsa_code_intelligence_reports(user_id,created_at desc,id desc);
create index dsa_code_reports_user_problem_idx on public.dsa_code_intelligence_reports(user_id,problem_id,created_at desc);
create index dsa_code_reports_generation_idx on public.dsa_code_intelligence_reports(generation_status,created_at)
 where generation_status in ('queued','failed');
create table public.dsa_learner_skill_signals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 report_id uuid not null,
 skill_key text not null check(skill_key ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
 signal_kind text not null check(signal_kind in ('strength','weakness','review')),
 confidence numeric(4,3) check(confidence is null or confidence between 0 and 1),
 recommendation text check(recommendation is null or char_length(recommendation)<=2000),
 public_evidence_reference text check(public_evidence_reference is null or char_length(public_evidence_reference)<=512),
 created_at timestamptz not null default now(),
 unique(report_id,skill_key,signal_kind),
 foreign key(report_id,user_id) references public.dsa_code_intelligence_reports(id,user_id) on delete cascade
);
create index dsa_skill_signals_user_skill_latest_idx on public.dsa_learner_skill_signals(user_id,skill_key,created_at desc);
alter table public.dsa_code_intelligence_reports enable row level security;
alter table public.dsa_learner_skill_signals enable row level security;
create policy dsa_code_reports_own on public.dsa_code_intelligence_reports
 for select to authenticated using(user_id=(select auth.uid()));
create policy dsa_skill_signals_own on public.dsa_learner_skill_signals
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.dsa_code_intelligence_reports,public.dsa_learner_skill_signals to authenticated;
grant all on public.dsa_code_intelligence_reports,public.dsa_learner_skill_signals to service_role;
revoke insert,update,delete on public.dsa_code_intelligence_reports,public.dsa_learner_skill_signals from anon,authenticated;

-- Deterministic judge facts are SNAPSHOTTED only from the canonical job.
-- Service-role callers cannot supply/overwrite user, verdict, metrics or hash.
create function public.dsa_code_report_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
declare j dsa_execution_private.jobs%rowtype;
begin
 select * into j from dsa_execution_private.jobs where id=NEW.submission_id;
 if not found or j.status not in ('completed','failed','timed_out','cancelled')
  or j.request->>'mode'<>'submit' then
   raise exception 'REPORT_REQUIRES_TERMINAL_SUBMISSION' using errcode='23514';
 end if;
 if TG_OP='UPDATE' and (NEW.submission_id<>OLD.submission_id
   or NEW.report_version<>OLD.report_version) then
  raise exception 'REPORT_IDENTITY_IMMUTABLE' using errcode='23514';
 end if;
 NEW.user_id:=j.user_id;
 NEW.problem_id:=(j.request->>'problemId')::uuid;
 NEW.problem_version_id:=(j.request->>'problemVersionId')::uuid;
 NEW.language:=j.request->>'language';
 NEW.code_sha256:=encode(sha256(convert_to(j.request->>'code','UTF8')),'hex');
 NEW.source_reference:='job:'||j.id::text||':code';
 NEW.judge_status:=j.status;
 NEW.verified_verdict:=j.result->>'verdict';
 NEW.verified_metrics:=jsonb_strip_nulls(jsonb_build_object(
   'wallTimeMs',j.result->'wallTimeMs',
   'executionTimeMs',j.result->'executionTimeMs',
   'memoryKiB',j.result->'memoryKiB',
   'passedTests',j.result->'passedTests',
   'totalTests',j.result->'totalTests'));
 NEW.updated_at:=now();
 return NEW;
end $$;
create trigger dsa_report_job_snapshot before insert or update
 on public.dsa_code_intelligence_reports for each row
 execute function public.dsa_code_report_snapshot();
-- Prevent report payloads from containing the most dangerous hidden fixture keys.
-- Application-level structured validation and moderation are still required.
alter table public.dsa_code_intelligence_reports add constraint dsa_assessment_no_raw_hidden
 check(assessment is null or (
  not (assessment ?| array['hiddenCases','hiddenFixtures','privatePlan','expectedOutputs','sandboxSecrets','referenceSolution'])
 ));
-- Seed review registry without changing eligibility.
insert into dsa_execution_private.certification_reviews(problem_version_id,suite_id,workflow_status)
select s.problem_version_id,s.id,
 case when exists(select 1 from dsa_execution_private.certificates c
  where c.suite_id=s.id and c.problem_version_id=s.problem_version_id
  and c.revoked_at is null and c.hidden_submit_approved)
 then 'certified' else 'awaiting_review' end
from public.dsa_test_suites s
join public.dsa_problem_definitions d on d.current_version_id=s.problem_version_id;
