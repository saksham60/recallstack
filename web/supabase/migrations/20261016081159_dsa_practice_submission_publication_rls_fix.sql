-- RLS must validate publication without granting learners direct access to internal
-- problem-definition/version tables. The fixed function lives in a non-API schema.
create or replace function dsa_execution_private.practice_problem_published(
  p_problem_id uuid, p_version_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1
    from public.dsa_problem_definitions d
    join public.dsa_problem_versions v on v.id=d.current_version_id
    where d.content_item_id=p_problem_id
      and d.current_version_id=p_version_id
      and v.status='published'
  );
$$;
revoke all on function dsa_execution_private.practice_problem_published(uuid,uuid)
from public,anon,authenticated;
grant usage on schema dsa_execution_private to authenticated;
grant execute on function dsa_execution_private.practice_problem_published(uuid,uuid)
to authenticated;
drop policy if exists dsa_practice_submission_insert_own_current
on public.dsa_practice_submissions;
create policy dsa_practice_submission_insert_own_current
on public.dsa_practice_submissions
for insert to authenticated
with check (
  user_id=(select auth.uid())
  and dsa_execution_private.practice_problem_published(problem_id,problem_version_id)
);
