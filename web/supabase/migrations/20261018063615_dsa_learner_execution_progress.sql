-- Read-only projection. Raw jobs, hidden evidence, manual learning state and
-- historical verdicts remain unchanged. Only the authenticated server may call.
create function public.dsa_learner_execution_progress(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  with owned as materialized (
    select j.request->>'problemId' problem_id,
      j.request->>'problemVersionId' version_id,
      j.updated_at,j.created_at,j.id,
      case
        when j.status='completed' and j.result->>'verdict'='accepted'
          and j.plan ? 'certificateId' and coalesce(j.plan->>'gradingLevel','official')='official'
          then 'solved'
        when j.status='completed' and j.result->>'verdict'='provisional_pass'
          then 'passed_current_tests'
        when j.status in ('completed','timed_out') and j.result->>'verdict' in
          ('wrong_answer','syntax_error','runtime_error','time_limit_exceeded','output_limit_exceeded')
          then 'attempted'
        when j.status in ('queued','running','cancelled') then j.status
        else 'execution_failed'
      end execution_status
    from dsa_execution_private.jobs j
    where p_user_id is not null and j.user_id=p_user_id and j.request->>'mode'='submit'
  ), visible_catalog as (
    select i.id,v.id version_id,i.current_published_version_id base_version,i.domain_id
    from public.dsa_problem_definitions def
    join public.dsa_problem_versions v on v.id=def.current_version_id and v.definition_id=def.id
    join public.content_items i on i.id=def.content_item_id
    join public.content_versions b on b.id=i.current_published_version_id and b.content_item_id=i.id
    join public.domains d on d.id=i.domain_id
    where p_user_id is not null and v.status='published'
      and v.provenance #> '{quality_review_20261015,publish_approved}'='true'::jsonb
      and i.archived_at is null and i.type::text='problem'
      and b.status::text='published' and b.published_at is not null and d.slug='dsa' and d.is_active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'problemId',c.id,'problemVersionId',c.version_id,
    'learningStatus',coalesce(p.status::text,'new'),
    'executionStatus',best.execution_status,
    'previousVersionPassed',exists(select 1 from owned o where o.problem_id=c.id::text
      and o.version_id<>c.version_id::text and o.execution_status in ('solved','passed_current_tests')),
    'categoryIds',coalesce((select jsonb_agg(distinct vc.category_id) from public.content_version_categories vc
      join public.categories cat on cat.id=vc.category_id and cat.domain_id=vc.domain_id and cat.is_active
      where vc.content_item_id=c.id and vc.content_version_id=c.base_version and vc.domain_id=c.domain_id),'[]'::jsonb)
  ) order by c.id),'[]'::jsonb)
  from visible_catalog c
  left join public.user_progress p on p.user_id=p_user_id and p.content_item_id=c.id
  left join lateral (
    select o.execution_status from owned o
    where o.problem_id=c.id::text and o.version_id=c.version_id::text
    order by case o.execution_status when 'solved' then 0 when 'passed_current_tests' then 1
      when 'attempted' then 2 else 3 end,o.created_at desc,o.id desc limit 1
  ) best on true;
$$;
revoke all on function public.dsa_learner_execution_progress(uuid) from public,anon,authenticated;
grant execute on function public.dsa_learner_execution_progress(uuid) to service_role;
comment on function public.dsa_learner_execution_progress(uuid) is
  'Server-only learner status projection; pass the verified session user, never a caller-supplied user ID. No source, hidden tests, plans or report evidence.';
