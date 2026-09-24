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
       or octet_length(p_next_state::text) > 65536 then
      raise exception 'invalid conversation state' using errcode = '22023';
    end if;

    if v_surface = 'dsa' then
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
         or (p_next_state - array['recentTurns', 'summary', 'lastMode', 'diagramId']::text[]) <> '{}'::jsonb
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
