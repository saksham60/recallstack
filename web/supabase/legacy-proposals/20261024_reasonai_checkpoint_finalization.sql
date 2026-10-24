-- UNAPPLIED HANDOFF: register/apply through the project's normal migration
-- process before enabling guarded System Design completion. No new tables.
-- Keep the shared DSA finalizer and its validation/authorization unchanged.
create or replace function public.reasonai_finalize_checkpoint_run(
  p_conversation_id uuid, p_run_id uuid, p_status text, p_last_seq integer,
  p_error_code text, p_assistant_id uuid, p_assistant_parts jsonb,
  p_next_state jsonb, p_expected_state_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.reasonai_runs%rowtype;
  v_version bigint;
  v_result jsonb;
begin
  if p_status <> 'completed' or p_expected_state_version is null or p_expected_state_version < 0 then
    raise exception 'invalid checkpoint completion' using errcode = '22023';
  end if;
  -- Authentication and ownership are checked inside the privileged boundary.
  -- KEY SHARE permits proposal-event foreign-key checks while we wait for the
  -- state row, avoiding an inverted conversation/state lock dependency.
  perform 1 from public.reasonai_conversations c
    where c.id = p_conversation_id and c.user_id = (select auth.uid()) and c.surface = 'system_design'
    for key share;
  if not found then raise exception 'conversation not found' using errcode = '42501'; end if;
  select r.* into v_run from public.reasonai_runs r
    where r.id = p_run_id and r.conversation_id = p_conversation_id for update;
  if not found then return null; end if;
  -- Preserve terminal single-winner semantics (including cancellation/recovery).
  if v_run.status <> 'running' then return to_jsonb(v_run); end if;
  select s.state_version into v_version from public.reasonai_conversation_state s
    where s.conversation_id = p_conversation_id for update;
  if coalesce(v_version, 0) <> p_expected_state_version then
    raise exception 'stale checkpoint completion' using errcode = '40001';
  end if;
  select to_jsonb(finalized) into v_result
    from public.reasonai_finalize_run(p_conversation_id, p_run_id, p_status, p_last_seq,
      p_error_code, p_assistant_id, p_assistant_parts, p_next_state) as finalized;
  return v_result;
end;
$$;
revoke all on function public.reasonai_finalize_checkpoint_run(uuid, uuid, text, integer, text, uuid, jsonb, jsonb, bigint) from public, anon;
grant execute on function public.reasonai_finalize_checkpoint_run(uuid, uuid, text, integer, text, uuid, jsonb, jsonb, bigint) to authenticated;
