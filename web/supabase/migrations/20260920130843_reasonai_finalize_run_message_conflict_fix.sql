do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'reasonai_finalize_run'
    and pg_get_function_identity_arguments(p.oid) = 'p_conversation_id uuid, p_run_id uuid, p_status text, p_last_seq integer, p_error_code text, p_assistant_id uuid, p_assistant_parts jsonb, p_next_state jsonb';

  if v_oid is null then
    raise exception 'reasonai_finalize_run(8 args) not found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('on conflict (id) do nothing' in v_def) = 0 then
    raise exception 'expected assistant-message conflict clause not found';
  end if;

  v_def := replace(
    v_def,
    'on conflict (id) do nothing',
    'on conflict on constraint reasonai_messages_pkey do nothing'
  );

  execute v_def;
end
$$;
