-- Persist real, account-linked practice submissions for EVERY published DSA problem.
-- These are explicitly NOT certified judge results. Historical certified executions remain unchanged.
create table if not exists public.dsa_practice_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id uuid not null references public.content_items(id),
  problem_version_id uuid not null references public.dsa_problem_versions(id),
  language text not null default 'python' check (language='python'),
  source_code text not null check (length(trim(source_code)) between 1 and 24000),
  check_status text not null check (check_status in ('examples_passed','examples_failed','not_evaluated')),
  -- These numbers come from the browser; they are NEVER official scores.
  client_checked_count integer not null default 0 check (client_checked_count between 0 and 20),
  client_passed_count integer not null default 0 check (client_passed_count between 0 and client_checked_count),
  grading_level text not null default 'browser_examples_unverified'
    check (grading_level='browser_examples_unverified'),
  created_at timestamptz not null default now(),
  constraint dsa_practice_submission_check_integrity check (
    (check_status='examples_passed' and client_checked_count>0 and client_checked_count=client_passed_count)
    or (check_status='examples_failed' and client_checked_count>0 and client_passed_count<client_checked_count)
    or (check_status='not_evaluated' and client_checked_count=0 and client_passed_count=0)
  )
);
create index if not exists dsa_practice_submissions_owner_recent_idx
  on public.dsa_practice_submissions(user_id,created_at desc,id desc);
create index if not exists dsa_practice_submissions_owner_problem_idx
  on public.dsa_practice_submissions(user_id,problem_id,created_at desc);
alter table public.dsa_practice_submissions enable row level security;
revoke all on public.dsa_practice_submissions from public,anon,authenticated;
grant select,insert on public.dsa_practice_submissions to authenticated;
drop policy if exists dsa_practice_submission_read_own on public.dsa_practice_submissions;
create policy dsa_practice_submission_read_own
  on public.dsa_practice_submissions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists dsa_practice_submission_insert_own_current on public.dsa_practice_submissions;
create policy dsa_practice_submission_insert_own_current
  on public.dsa_practice_submissions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dsa_problem_definitions d
        join public.dsa_problem_versions v on v.id=d.current_version_id
      where d.content_item_id=problem_id
        and d.current_version_id=problem_version_id
        and v.status='published'
    )
  );
-- Server-side quota applies even to direct PostgREST writes.
create or replace function public.dsa_practice_submissions_quota()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (select count(*) from public.dsa_practice_submissions s
       where s.user_id=new.user_id and s.created_at>=now()-interval '1 day')>=120 then
    raise exception 'Practice submission daily limit reached' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.dsa_practice_submissions_quota() from public,anon,authenticated;
drop trigger if exists dsa_practice_submissions_quota_trigger on public.dsa_practice_submissions;
create trigger dsa_practice_submissions_quota_trigger
  before insert on public.dsa_practice_submissions
  for each row execute function public.dsa_practice_submissions_quota();
comment on table public.dsa_practice_submissions is 'Persistent Python learner submissions using untrusted browser example feedback; never official judging or mastered progress.';
