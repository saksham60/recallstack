
-- Decoupled AI report queue: NEVER add a report trigger to judge finalization.
-- The judge verdict commits first. A separate server-only reconcile call can retry.
create function public.dsa_code_intelligence_enqueue(p_batch_size integer default 100)
returns integer language plpgsql security invoker set search_path='' as $$
declare v_total integer;
begin
 if current_user<>'service_role' then
   raise exception 'SERVICE_ONLY' using errcode='42501';end if;
 with eligible as (
  select j.id,j.user_id,(j.request->>'problemId')::uuid problem_id,
   (j.request->>'problemVersionId')::uuid version_id,
   j.request->>'language' language,
   encode(sha256(convert_to(j.request->>'code','UTF8')),'hex') code_hash,
   j.status status
  from dsa_execution_private.jobs j
  where j.status in ('completed','failed','timed_out','cancelled')
   and j.request->>'mode'='submit'
   and not exists(select 1 from public.dsa_code_intelligence_reports r
    where r.submission_id=j.id)
  order by j.created_at,j.id
  limit greatest(1,least(coalesce(p_batch_size,100),100))
 ), written as (
  insert into public.dsa_code_intelligence_reports(
   submission_id,user_id,problem_id,problem_version_id,language,
   code_sha256,source_reference,judge_status,generation_status)
  select e.id,e.user_id,e.problem_id,e.version_id,e.language,
   e.code_hash,'job:'||e.id::text||':code',e.status,
   case when e.status='completed' and e.language='python' then 'queued' else 'skipped' end
  from eligible e
  on conflict(submission_id,report_version) do nothing
  returning id
 )
 select count(*) into v_total from written;
 return v_total;
end $$;
revoke all on function public.dsa_code_intelligence_enqueue(integer) from public,anon,authenticated;
grant execute on function public.dsa_code_intelligence_enqueue(integer) to service_role;

create function public.dsa_code_intelligence_claim(p_batch_size integer default 10)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_claims jsonb;
begin
 if current_user<>'service_role' then
  raise exception 'SERVICE_ONLY' using errcode='42501';end if;
 with due as (
  select id from public.dsa_code_intelligence_reports
  where generation_attempts<5 and (
   generation_status='queued'
   or (generation_status='failed' and updated_at<now()-interval '5 minutes')
   or (generation_status='generating' and generation_started_at<now()-interval '15 minutes'))
  order by created_at,id
  for update skip locked
  limit greatest(1,least(coalesce(p_batch_size,10),50))
 ), claimed as (
  update public.dsa_code_intelligence_reports r
  set generation_status='generating',generation_attempts=r.generation_attempts+1,
      generation_started_at=now(),error_code=null,updated_at=now()
  from due where r.id=due.id
  returning r.id,r.submission_id,r.problem_id,r.problem_version_id,r.report_version,r.generation_attempts
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'reportId',id,'submissionId',submission_id,'problemId',problem_id,
  'problemVersionId',problem_version_id,'reportVersion',report_version,
  'attempt',generation_attempts)),'[]'::jsonb)
 into v_claims from claimed;
 return v_claims;
end $$;
revoke all on function public.dsa_code_intelligence_claim(integer) from public,anon,authenticated;
grant execute on function public.dsa_code_intelligence_claim(integer) to service_role;
-- Only server code marks completed/failed; it never writes verified verdicts itself.
