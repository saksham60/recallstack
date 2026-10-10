-- System Design durable proposal state. Keep DSA limits unchanged.
-- Allow the shared ReasonAI finalizer to validate each surface's bounded state shape.
-- DSA and System Design intentionally persist different compact conversation state.
create or replace function public.reasonai_finalize_run(
  p_conversation_id uuid,
  p_run_id uuid,
  p_status text,
  p_last_seq integer,
  p_error_code text,
  p_assistant_id uuid,
  p_assistant_parts jsonb,
  p_next_state jsonb
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
security definer
set search_path = ''
as $$
declare
  v_run public.reasonai_runs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_turn jsonb;
  v_surface text;
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

  -- Resolve ownership and surface before validating surface-specific state.
  select c.surface into v_surface
  from public.reasonai_conversations as c
  where c.id = p_conversation_id
    and c.user_id = (select auth.uid());
  if not found then return; end if;

  if p_status = 'completed' and p_next_state is null then
    raise exception 'completed runs require conversation state' using errcode = '22023';
  end if;
  if p_status <> 'completed' and p_next_state is not null then
    raise exception 'non-completed runs cannot advance conversation state' using errcode = '22023';
  end if;

  if p_next_state is not null then
    if jsonb_typeof(p_next_state) <> 'object'
       or octet_length(p_next_state::text) > 524288 then
      raise exception 'invalid conversation state' using errcode = '22023';
    end if;

    if v_surface = 'dsa' then
      if octet_length(p_next_state::text) > 65536 then
        raise exception 'invalid dsa conversation state' using errcode = '22023';
      end if;
      if not (p_next_state ?& array['recentTurns', 'summary', 'hintProgress'])
         or (p_next_state - array['recentTurns', 'summary', 'hintProgress', 'problemIdentity', 'lastTutorMode']::text[]) <> '{}'::jsonb
         or jsonb_typeof(p_next_state->'recentTurns') <> 'array'
         or jsonb_array_length(p_next_state->'recentTurns') > 6
         or jsonb_typeof(p_next_state->'summary') <> 'string'
         or char_length(p_next_state->>'summary') > 4000
         or jsonb_typeof(p_next_state->'hintProgress') <> 'number'
         or (p_next_state->>'hintProgress')::numeric <> trunc((p_next_state->>'hintProgress')::numeric)
         or (p_next_state->>'hintProgress')::numeric not between 0 and 20
      then
        raise exception 'invalid dsa conversation state' using errcode = '22023';
      end if;

      for v_turn in select value from jsonb_array_elements(p_next_state->'recentTurns') loop
        if jsonb_typeof(v_turn) <> 'object'
           or not (v_turn ?& array['user', 'assistant', 'action', 'hintLevel'])
           or (v_turn - array['user', 'assistant', 'action', 'hintLevel']::text[]) <> '{}'::jsonb
           or jsonb_typeof(v_turn->'user') <> 'string'
           or char_length(v_turn->>'user') > 2000
           or jsonb_typeof(v_turn->'assistant') <> 'string'
           or char_length(v_turn->>'assistant') > 4000
           or jsonb_typeof(v_turn->'action') <> 'string'
           or (v_turn->>'action') not in ('chat','hint','review','solution','complexity','explain','start','trace','visualize','research')
           or jsonb_typeof(v_turn->'hintLevel') <> 'number'
           or (v_turn->>'hintLevel')::numeric <> trunc((v_turn->>'hintLevel')::numeric)
           or (v_turn->>'hintLevel')::numeric not between 0 and 20
        then
          raise exception 'invalid dsa conversation turn' using errcode = '22023';
        end if;
      end loop;

      if p_next_state ? 'problemIdentity' and (
        jsonb_typeof(p_next_state->'problemIdentity') <> 'object'
        or not ((p_next_state->'problemIdentity') ?& array['contentId', 'slug', 'title'])
        or ((p_next_state->'problemIdentity') - array['contentId', 'slug', 'title']::text[]) <> '{}'::jsonb
        or jsonb_typeof(p_next_state->'problemIdentity'->'contentId') <> 'string'
        or char_length(p_next_state->'problemIdentity'->>'contentId') > 200
        or jsonb_typeof(p_next_state->'problemIdentity'->'slug') <> 'string'
        or char_length(p_next_state->'problemIdentity'->>'slug') > 200
        or jsonb_typeof(p_next_state->'problemIdentity'->'title') <> 'string'
        or char_length(p_next_state->'problemIdentity'->>'title') > 300
      ) then
        raise exception 'invalid problem identity' using errcode = '22023';
      end if;

      if p_next_state ? 'lastTutorMode' and (
        jsonb_typeof(p_next_state->'lastTutorMode') <> 'string'
        or (p_next_state->>'lastTutorMode') not in ('chat','hint','review','solution','complexity','explain','start','trace','visualize','research')
      ) then
        raise exception 'invalid tutor mode' using errcode = '22023';
      end if;

    elsif v_surface = 'system_design' then
      if not (p_next_state ?& array['recentTurns', 'summary'])
         or (p_next_state - array['recentTurns', 'summary', 'lastMode', 'diagramId', 'pendingProposal']::text[]) <> '{}'::jsonb
         or jsonb_typeof(p_next_state->'recentTurns') <> 'array'
         or jsonb_array_length(p_next_state->'recentTurns') > 6
         or jsonb_typeof(p_next_state->'summary') <> 'string'
         or char_length(p_next_state->>'summary') > 4000
      then
        raise exception 'invalid system design conversation state' using errcode = '22023';
      end if;

      for v_turn in select value from jsonb_array_elements(p_next_state->'recentTurns') loop
        if jsonb_typeof(v_turn) <> 'object'
           or not (v_turn ?& array['user', 'assistant', 'mode'])
           or (v_turn - array['user', 'assistant', 'mode']::text[]) <> '{}'::jsonb
           or jsonb_typeof(v_turn->'user') <> 'string'
           or char_length(v_turn->>'user') > 4000
           or jsonb_typeof(v_turn->'assistant') <> 'string'
           or char_length(v_turn->>'assistant') > 8000
           or jsonb_typeof(v_turn->'mode') <> 'string'
           or (v_turn->>'mode') not in ('chat','review','fix','eagle')
        then
          raise exception 'invalid system design conversation turn' using errcode = '22023';
        end if;
      end loop;

      if p_next_state ? 'lastMode' and (
        jsonb_typeof(p_next_state->'lastMode') <> 'string'
        or (p_next_state->>'lastMode') not in ('chat','review','fix','eagle')
      ) then
        raise exception 'invalid system design mode' using errcode = '22023';
      end if;

      if p_next_state ? 'diagramId' and (
        jsonb_typeof(p_next_state->'diagramId') <> 'string'
        or char_length(p_next_state->>'diagramId') > 256
      ) then
        raise exception 'invalid system design diagram id' using errcode = '22023';
      end if;
      if p_next_state ? 'pendingProposal' then
        if jsonb_typeof(p_next_state->'pendingProposal') <> 'object'
           or not ((p_next_state->'pendingProposal') ?& array['proposalId','version','diagramId','baseFingerprint','baseContext','lastReportedFingerprint','status','proposal','operationIds','acceptedOperationIds','dismissedOperationIds','refMappings','warnings'])
           or ((p_next_state->'pendingProposal') - array['proposalId','version','diagramId','baseFingerprint','baseContext','lastReportedFingerprint','status','proposal','operationIds','acceptedOperationIds','dismissedOperationIds','refMappings','warnings']::text[]) <> '{}'::jsonb
           or jsonb_typeof(p_next_state->'pendingProposal'->'proposal') <> 'object'
           or jsonb_typeof(p_next_state->'pendingProposal'->'baseContext') <> 'object'
           or jsonb_typeof(p_next_state->'pendingProposal'->'operationIds') <> 'array'
           or jsonb_array_length(p_next_state->'pendingProposal'->'operationIds') > 150
           or jsonb_typeof(p_next_state->'pendingProposal'->'acceptedOperationIds') <> 'array'
           or jsonb_array_length(p_next_state->'pendingProposal'->'acceptedOperationIds') > 150
           or jsonb_typeof(p_next_state->'pendingProposal'->'dismissedOperationIds') <> 'array'
           or jsonb_array_length(p_next_state->'pendingProposal'->'dismissedOperationIds') > 150
           or jsonb_typeof(p_next_state->'pendingProposal'->'refMappings') <> 'object'
           or jsonb_typeof(p_next_state->'pendingProposal'->'warnings') <> 'array'
           or jsonb_array_length(p_next_state->'pendingProposal'->'warnings') > 150
           or (p_next_state->'pendingProposal'->>'status') not in ('pending','partially_accepted','accepted','discarded','superseded','stale','failed')
           or char_length(p_next_state->'pendingProposal'->>'diagramId') > 256
           or char_length(p_next_state->'pendingProposal'->>'baseFingerprint') > 100
           or (p_next_state->'pendingProposal'->>'version')::numeric < 1
        then
          raise exception 'invalid system design pending proposal' using errcode = '22023';
        end if;
      end if;
    else
      raise exception 'unsupported ReasonAI surface' using errcode = '22023';
    end if;
  end if;

  select r.* into v_run
  from public.reasonai_runs as r
  where r.id = p_run_id and r.conversation_id = p_conversation_id
  for update;
  if not found then return; end if;

  -- Terminal rows are immutable so completion/cancel/recovery remain single-winner.
  if v_run.status = 'running' then
    if p_assistant_id is not null then
      insert into public.reasonai_messages (id, conversation_id, run_id, role, parts, status)
      values (p_assistant_id, p_conversation_id, p_run_id, 'assistant', p_assistant_parts, p_status)
      on conflict on constraint reasonai_messages_pkey do nothing;
    end if;

    if p_status = 'completed' then
      insert into public.reasonai_conversation_state (
        conversation_id, state, state_version, last_run_id, created_at, updated_at
      ) values (
        p_conversation_id, p_next_state, 1, p_run_id, v_now, v_now
      )
      on conflict on constraint reasonai_conversation_state_pkey do update
      set state = excluded.state,
          state_version = public.reasonai_conversation_state.state_version + 1,
          last_run_id = excluded.last_run_id,
          updated_at = excluded.updated_at;
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

revoke all on function public.reasonai_finalize_run(uuid, uuid, text, integer, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.reasonai_finalize_run(uuid, uuid, text, integer, text, uuid, jsonb, jsonb) to authenticated;

comment on function public.reasonai_finalize_run(uuid, uuid, text, integer, text, uuid, jsonb, jsonb) is
  'Atomically persists a ReasonAI terminal run and validates bounded conversation state according to the conversation surface.';

-- Receipts make retries idempotent. An acceptance receipt records a locally
-- verified canvas commit; this database does not contain the offline canvas.
create table if not exists public.reasonai_proposal_events (
  event_id uuid primary key,
  conversation_id uuid not null references public.reasonai_conversations(id) on delete cascade,
  user_id uuid not null,
  proposal_id uuid not null,
  proposal_version bigint not null check (proposal_version > 0),
  action text not null check (action in ('accept_all', 'accept_item', 'dismiss_item', 'discard')),
  operation_id uuid,
  ref text,
  real_node_id text,
  post_fingerprint text,
  created_at timestamptz not null default now()
);
create index if not exists reasonai_proposal_events_conversation_idx on public.reasonai_proposal_events(conversation_id, created_at desc);
alter table public.reasonai_proposal_events enable row level security;
create policy reasonai_proposal_events_select_own on public.reasonai_proposal_events
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.reasonai_proposal_events from public, anon, authenticated;
grant select on table public.reasonai_proposal_events to authenticated;

create or replace function public.reasonai_transition_proposal(
  p_conversation_id uuid,
  p_event_id uuid,
  p_proposal_id uuid,
  p_proposal_version bigint,
  p_expected_state_version bigint,
  p_action text,
  p_operation_id uuid default null,
  p_ref text default null,
  p_real_node_id text default null,
  p_post_fingerprint text default null
)
returns table (state_version bigint, proposal_status text, duplicate boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.reasonai_conversation_state%rowtype;
  v_event public.reasonai_proposal_events%rowtype;
  v_pending jsonb;
  v_status text;
  v_updated jsonb;
  v_ids jsonb;
  v_index integer;
begin
  if p_action not in ('accept_all', 'accept_item', 'dismiss_item', 'discard')
     or p_proposal_version < 1 or p_expected_state_version < 1
     or (p_post_fingerprint is not null and (char_length(p_post_fingerprint) > 100 or p_post_fingerprint !~ '^fnv64:[0-9a-f]{16}$'))
     or (p_ref is not null and (char_length(p_ref) > 80 or p_ref !~ '^new:[A-Za-z0-9_-]+$'))
     or (p_real_node_id is not null and (char_length(p_real_node_id) > 256 or p_real_node_id !~ '^node_[0-9a-f-]{36}$'))
  then raise exception 'invalid proposal transition' using errcode = '22023'; end if;

  if not exists (select 1 from public.reasonai_conversations c
    where c.id = p_conversation_id and c.user_id = (select auth.uid()) and c.surface = 'system_design')
  then return; end if;

  select * into v_state from public.reasonai_conversation_state
    where conversation_id = p_conversation_id for update;
  if not found then return; end if;

  select * into v_event from public.reasonai_proposal_events where event_id = p_event_id;
  if found then
    if v_event.conversation_id <> p_conversation_id or v_event.user_id <> (select auth.uid())
       or v_event.proposal_id <> p_proposal_id or v_event.proposal_version <> p_proposal_version
       or v_event.action <> p_action or v_event.operation_id is distinct from p_operation_id
       or v_event.ref is distinct from p_ref or v_event.real_node_id is distinct from p_real_node_id
       or v_event.post_fingerprint is distinct from p_post_fingerprint
    then raise exception 'proposal event ID was reused' using errcode = '23505'; end if;
    return query select s.state_version, s.state->'pendingProposal'->>'status', true
      from public.reasonai_conversation_state s where s.conversation_id = p_conversation_id;
    return;
  end if;

  v_pending := v_state.state->'pendingProposal';
  if exists (select 1 from public.reasonai_runs r where r.conversation_id = p_conversation_id and r.status = 'running')
  then raise exception 'proposal transition conflicts with an active run' using errcode = '40001'; end if;
  if v_state.state_version <> p_expected_state_version
     or v_pending is null or v_pending->>'proposalId' <> p_proposal_id::text
     or (v_pending->>'version')::bigint <> p_proposal_version
     or v_pending->>'status' not in ('pending','partially_accepted')
  then raise exception 'stale proposal transition' using errcode = '40001'; end if;

  if p_action = 'discard' then
    if p_operation_id is not null or p_ref is not null or p_real_node_id is not null or p_post_fingerprint is not null
    then raise exception 'invalid discard transition' using errcode = '22023'; end if;
    v_status := 'discarded';
  elsif p_action = 'accept_all' then
    if p_operation_id is not null or p_ref is not null or p_real_node_id is not null or p_post_fingerprint is null
       or jsonb_array_length(v_pending->'acceptedOperationIds') > 0
       or jsonb_array_length(v_pending->'dismissedOperationIds') > 0
    then raise exception 'invalid accept-all transition' using errcode = '22023'; end if;
    v_pending := jsonb_set(v_pending, '{acceptedOperationIds}', v_pending->'operationIds');
    v_status := 'accepted';
  else
    if p_operation_id is null or not (v_pending->'operationIds' ? p_operation_id::text)
       or (v_pending->'acceptedOperationIds' ? p_operation_id::text)
       or (v_pending->'dismissedOperationIds' ? p_operation_id::text)
       or (p_action = 'accept_item' and p_post_fingerprint is null)
       or (p_action = 'dismiss_item' and p_post_fingerprint is not null)
    then raise exception 'invalid item transition' using errcode = '22023'; end if;
    select (item.ordinality - 1)::integer into v_index
      from jsonb_array_elements_text(v_pending->'operationIds') with ordinality as item(value, ordinality)
      where item.value = p_operation_id::text;
    if p_action = 'accept_item' and v_pending->'proposal'->'operations'->v_index->>'op' = 'add_node' then
      if p_ref is distinct from v_pending->'proposal'->'operations'->v_index->>'ref' or p_real_node_id is null
      then raise exception 'invalid node mapping' using errcode = '22023'; end if;
    elsif p_ref is not null or p_real_node_id is not null then
      raise exception 'unexpected node mapping' using errcode = '22023';
    end if;
    if p_action = 'accept_item' then
      v_ids := v_pending->'acceptedOperationIds' || to_jsonb(p_operation_id::text);
      v_pending := jsonb_set(v_pending, '{acceptedOperationIds}', v_ids);
      if p_ref is not null and p_real_node_id is not null then
        v_pending := jsonb_set(v_pending, array['refMappings',p_ref], to_jsonb(p_real_node_id), true);
      elsif p_ref is not null or p_real_node_id is not null then
        raise exception 'incomplete node mapping' using errcode = '22023';
      end if;
    else
      v_ids := v_pending->'dismissedOperationIds' || to_jsonb(p_operation_id::text);
      v_pending := jsonb_set(v_pending, '{dismissedOperationIds}', v_ids);
    end if;
    v_status := case when jsonb_array_length(v_pending->'acceptedOperationIds') + jsonb_array_length(v_pending->'dismissedOperationIds') = jsonb_array_length(v_pending->'operationIds')
      then case when jsonb_array_length(v_pending->'acceptedOperationIds') > 0 then 'accepted' else 'discarded' end
      else 'partially_accepted' end;
  end if;

  if p_post_fingerprint is not null then
    v_pending := jsonb_set(v_pending, '{lastReportedFingerprint}', to_jsonb(p_post_fingerprint));
  end if;
  v_pending := jsonb_set(v_pending, '{status}', to_jsonb(v_status));
  v_updated := jsonb_set(v_state.state, '{pendingProposal}', v_pending);
  update public.reasonai_conversation_state s
    set state = v_updated, state_version = s.state_version + 1, updated_at = clock_timestamp()
    where s.conversation_id = p_conversation_id
    returning s.state_version into state_version;
  insert into public.reasonai_proposal_events(event_id,conversation_id,user_id,proposal_id,proposal_version,action,operation_id,ref,real_node_id,post_fingerprint)
    values (p_event_id,p_conversation_id,(select auth.uid()),p_proposal_id,p_proposal_version,p_action,p_operation_id,p_ref,p_real_node_id,p_post_fingerprint);
  proposal_status := v_status;
  duplicate := false;
  return next;
end;
$$;
revoke all on function public.reasonai_transition_proposal(uuid,uuid,uuid,bigint,bigint,text,uuid,text,text,text) from public, anon;
grant execute on function public.reasonai_transition_proposal(uuid,uuid,uuid,bigint,bigint,text,uuid,text,text,text) to authenticated;
