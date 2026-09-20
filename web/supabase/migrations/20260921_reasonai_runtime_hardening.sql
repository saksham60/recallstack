-- Finite run leases and atomic lifecycle transitions for ReasonAI V2.
alter table public.reasonai_runs
  add column if not exists heartbeat_at timestamptz;

update public.reasonai_runs
set heartbeat_at = coalesce(updated_at, started_at, created_at, now())
where heartbeat_at is null;

alter table public.reasonai_runs
  alter column heartbeat_at set default now(),
  alter column heartbeat_at set not null;

create index if not exists reasonai_runs_running_heartbeat_idx
  on public.reasonai_runs (conversation_id, heartbeat_at)
  where status = 'running';

create or replace function public.reasonai_acquire_run(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_run_id uuid
)
returns table (
  acquisition_kind text,
  recovered_run_id uuid,
  id uuid,
  conversation_id uuid,
  idempotency_key text,
  status text,
  last_seq integer,
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  error_code text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.reasonai_runs%rowtype;
  v_active public.reasonai_runs%rowtype;
  v_recovered_run_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  -- The conversation lock serializes all acquisitions for one conversation.
  perform 1
  from public.reasonai_conversations as c
  where c.id = p_conversation_id
    and c.user_id = (select auth.uid())
  for update;
  if not found then
    return;
  end if;

  select r.* into v_existing
  from public.reasonai_runs as r
  where r.conversation_id = p_conversation_id
    and r.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.status = 'running'
       and v_existing.heartbeat_at <= v_now - interval '120 seconds' then
      update public.reasonai_runs as r
      set status = 'interrupted',
          error_code = 'RUN_LEASE_EXPIRED',
          completed_at = v_now,
          updated_at = v_now
      where r.id = v_existing.id and r.status = 'running';
      v_existing.status := 'interrupted';
      v_existing.error_code := 'RUN_LEASE_EXPIRED';
      v_existing.completed_at := v_now;
      v_existing.updated_at := v_now;
      v_recovered_run_id := v_existing.id;
    end if;

    return query select
      case when v_existing.status = 'running' then 'active' else 'replay' end,
      v_recovered_run_id,
      v_existing.id, v_existing.conversation_id, v_existing.idempotency_key,
      v_existing.status, v_existing.last_seq, v_existing.started_at,
      v_existing.heartbeat_at, v_existing.completed_at, v_existing.cancelled_at,
      v_existing.error_code, v_existing.created_at, v_existing.updated_at;
    return;
  end if;

  select r.* into v_active
  from public.reasonai_runs as r
  where r.conversation_id = p_conversation_id and r.status = 'running'
  for update;

  if found and v_active.heartbeat_at > v_now - interval '120 seconds' then
    return query select
      'active'::text, null::uuid,
      v_active.id, v_active.conversation_id, v_active.idempotency_key,
      v_active.status, v_active.last_seq, v_active.started_at,
      v_active.heartbeat_at, v_active.completed_at, v_active.cancelled_at,
      v_active.error_code, v_active.created_at, v_active.updated_at;
    return;
  elsif found then
    update public.reasonai_runs as r
    set status = 'interrupted',
        error_code = 'RUN_LEASE_EXPIRED',
        completed_at = v_now,
        updated_at = v_now
    where r.id = v_active.id and r.status = 'running';
    v_recovered_run_id := v_active.id;
  end if;

  insert into public.reasonai_runs (
    id, conversation_id, idempotency_key, status, last_seq,
    started_at, heartbeat_at, created_at, updated_at
  ) values (
    p_run_id, p_conversation_id, p_idempotency_key, 'running', 0,
    v_now, v_now, v_now, v_now
  ) returning * into v_active;

  return query select
    'acquired'::text, v_recovered_run_id,
    v_active.id, v_active.conversation_id, v_active.idempotency_key,
    v_active.status, v_active.last_seq, v_active.started_at,
    v_active.heartbeat_at, v_active.completed_at, v_active.cancelled_at,
    v_active.error_code, v_active.created_at, v_active.updated_at;
end;
$$;

create or replace function public.reasonai_finalize_run(
  p_conversation_id uuid,
  p_run_id uuid,
  p_status text,
  p_last_seq integer,
  p_error_code text,
  p_assistant_id uuid,
  p_assistant_parts jsonb
)
returns table (
  id uuid,
  conversation_id uuid,
  idempotency_key text,
  status text,
  last_seq integer,
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  error_code text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.reasonai_runs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_status not in ('completed', 'failed', 'cancelled', 'interrupted')
     or p_last_seq < 0
     or (p_error_code is not null and char_length(p_error_code) > 200) then
    raise exception 'invalid terminal run state' using errcode = '22023';
  end if;
  if (p_assistant_id is null) <> (p_assistant_parts is null) then
    raise exception 'assistant id and parts must be supplied together' using errcode = '22023';
  end if;
  if p_assistant_parts is not null and (
    jsonb_typeof(p_assistant_parts) <> 'array'
    or octet_length(p_assistant_parts::text) > 524288
  ) then
    raise exception 'invalid assistant parts' using errcode = '22023';
  end if;

  perform 1
  from public.reasonai_conversations as c
  where c.id = p_conversation_id
    and c.user_id = (select auth.uid());
  if not found then
    return;
  end if;

  select r.* into v_run
  from public.reasonai_runs as r
  where r.id = p_run_id and r.conversation_id = p_conversation_id
  for update;
  if not found then
    return;
  end if;

  -- A terminal row is immutable. This makes completion/cancel/recovery single-winner.
  if v_run.status = 'running' then
    if p_assistant_id is not null then
      insert into public.reasonai_messages (
        id, conversation_id, run_id, role, parts, status
      ) values (
        p_assistant_id, p_conversation_id, p_run_id, 'assistant',
        p_assistant_parts, p_status
      ) on conflict (id) do nothing;
    end if;

    update public.reasonai_runs as r
    set status = p_status,
        last_seq = p_last_seq,
        error_code = p_error_code,
        completed_at = case when p_status <> 'cancelled' then v_now else null end,
        cancelled_at = case when p_status = 'cancelled' then v_now else null end,
        updated_at = v_now
    where r.id = p_run_id and r.status = 'running'
    returning r.* into v_run;

    update public.reasonai_conversations as c
    set updated_at = v_now
    where c.id = p_conversation_id;
  end if;

  return query select
    v_run.id, v_run.conversation_id, v_run.idempotency_key, v_run.status,
    v_run.last_seq, v_run.started_at, v_run.heartbeat_at,
    v_run.completed_at, v_run.cancelled_at, v_run.error_code,
    v_run.created_at, v_run.updated_at;
end;
$$;

-- Harden all ReasonAI RLS policies and make their target roles explicit.
drop policy if exists reasonai_conversations_select_own on public.reasonai_conversations;
drop policy if exists reasonai_conversations_insert_own on public.reasonai_conversations;
drop policy if exists reasonai_conversations_update_own on public.reasonai_conversations;
drop policy if exists reasonai_conversations_delete_own on public.reasonai_conversations;
create policy reasonai_conversations_select_own on public.reasonai_conversations for select to authenticated using (user_id = (select auth.uid()));
create policy reasonai_conversations_insert_own on public.reasonai_conversations for insert to authenticated with check (user_id = (select auth.uid()));
create policy reasonai_conversations_update_own on public.reasonai_conversations for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reasonai_conversations_delete_own on public.reasonai_conversations for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists reasonai_messages_select_own on public.reasonai_messages;
drop policy if exists reasonai_messages_insert_own on public.reasonai_messages;
drop policy if exists reasonai_messages_update_own on public.reasonai_messages;
drop policy if exists reasonai_messages_delete_own on public.reasonai_messages;
create policy reasonai_messages_select_own on public.reasonai_messages for select to authenticated using (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_messages.conversation_id and c.user_id = (select auth.uid())));
create policy reasonai_messages_insert_own on public.reasonai_messages for insert to authenticated with check (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_messages.conversation_id and c.user_id = (select auth.uid())));
create policy reasonai_messages_update_own on public.reasonai_messages for update to authenticated using (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_messages.conversation_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_messages.conversation_id and c.user_id = (select auth.uid())));
create policy reasonai_messages_delete_own on public.reasonai_messages for delete to authenticated using (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_messages.conversation_id and c.user_id = (select auth.uid())));

drop policy if exists reasonai_runs_select_own on public.reasonai_runs;
drop policy if exists reasonai_runs_insert_own on public.reasonai_runs;
drop policy if exists reasonai_runs_update_own on public.reasonai_runs;
drop policy if exists reasonai_runs_delete_own on public.reasonai_runs;
create policy reasonai_runs_select_own on public.reasonai_runs for select to authenticated using (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_runs.conversation_id and c.user_id = (select auth.uid())));
create policy reasonai_runs_insert_own on public.reasonai_runs for insert to authenticated with check (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_runs.conversation_id and c.user_id = (select auth.uid())));
create policy reasonai_runs_update_own on public.reasonai_runs for update to authenticated using (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_runs.conversation_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_runs.conversation_id and c.user_id = (select auth.uid())));
create policy reasonai_runs_delete_own on public.reasonai_runs for delete to authenticated using (exists (select 1 from public.reasonai_conversations c where c.id = reasonai_runs.conversation_id and c.user_id = (select auth.uid())));

drop policy if exists reasonai_learner_memories_select_own on public.reasonai_learner_memories;
drop policy if exists reasonai_learner_memories_insert_own on public.reasonai_learner_memories;
drop policy if exists reasonai_learner_memories_update_own on public.reasonai_learner_memories;
drop policy if exists reasonai_learner_memories_delete_own on public.reasonai_learner_memories;
create policy reasonai_learner_memories_select_own on public.reasonai_learner_memories for select to authenticated using (user_id = (select auth.uid()));
create policy reasonai_learner_memories_insert_own on public.reasonai_learner_memories for insert to authenticated with check (user_id = (select auth.uid()));
create policy reasonai_learner_memories_update_own on public.reasonai_learner_memories for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reasonai_learner_memories_delete_own on public.reasonai_learner_memories for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.reasonai_conversations, public.reasonai_runs, public.reasonai_messages, public.reasonai_learner_memories from anon, public;
grant select, insert, update, delete on table public.reasonai_conversations to authenticated;
grant select, insert, update on table public.reasonai_runs to authenticated;
grant select, insert, update on table public.reasonai_messages to authenticated;
grant select, insert, update on table public.reasonai_learner_memories to authenticated;
grant usage, select on sequence public.reasonai_messages_ordinal_seq to authenticated;

revoke all on function public.reasonai_acquire_run(uuid, text, uuid) from public, anon;
revoke all on function public.reasonai_finalize_run(uuid, uuid, text, integer, text, uuid, jsonb) from public, anon;
grant execute on function public.reasonai_acquire_run(uuid, text, uuid) to authenticated;
grant execute on function public.reasonai_finalize_run(uuid, uuid, text, integer, text, uuid, jsonb) to authenticated;

comment on column public.reasonai_runs.heartbeat_at is
  'Server-refreshed liveness timestamp. Running leases expire after 120 seconds without refresh.';
comment on function public.reasonai_acquire_run(uuid, text, uuid) is
  'Atomically enforces idempotency, recovers expired leases, and acquires at most one running run per conversation.';
comment on function public.reasonai_finalize_run(uuid, uuid, text, integer, text, uuid, jsonb) is
  'Atomically persists the assistant transcript and performs the single-winner terminal run transition.';
