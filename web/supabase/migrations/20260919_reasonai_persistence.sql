-- Application transcript persistence for ReasonAI. LangGraph checkpoints are intentionally separate.
create table if not exists public.reasonai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('dsa', 'system_design')),
  context_id text check (context_id is null or char_length(context_id) between 1 and 256),
  title text check (title is null or char_length(title) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reasonai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.reasonai_conversations(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  status text not null check (status in ('running', 'completed', 'failed', 'cancelled', 'interrupted')),
  last_seq integer not null default 0 check (last_seq >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, idempotency_key),
  unique (id, conversation_id)
);

create table if not exists public.reasonai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.reasonai_conversations(id) on delete cascade,
  run_id uuid,
  ordinal bigint generated always as identity,
  role text not null check (role in ('user', 'assistant')),
  parts jsonb not null check (
    jsonb_typeof(parts) = 'array'
    and octet_length(parts::text) <= 524288
  ),
  status text not null check (status in ('completed', 'streaming', 'cancelled', 'failed', 'interrupted')),
  created_at timestamptz not null default now(),
  foreign key (run_id, conversation_id)
    references public.reasonai_runs(id, conversation_id)
    on delete cascade
);

create index if not exists reasonai_conversations_user_updated_idx
  on public.reasonai_conversations (user_id, updated_at desc, id desc);
create index if not exists reasonai_conversations_user_surface_context_idx
  on public.reasonai_conversations (user_id, surface, context_id, updated_at desc);
create index if not exists reasonai_messages_conversation_order_idx
  on public.reasonai_messages (conversation_id, ordinal);
create index if not exists reasonai_messages_run_idx
  on public.reasonai_messages (run_id) where run_id is not null;
create index if not exists reasonai_runs_conversation_created_idx
  on public.reasonai_runs (conversation_id, created_at desc);
create unique index if not exists reasonai_runs_one_running_per_conversation_idx
  on public.reasonai_runs (conversation_id) where status = 'running';

alter table public.reasonai_conversations enable row level security;
alter table public.reasonai_messages enable row level security;
alter table public.reasonai_runs enable row level security;

create policy reasonai_conversations_select_own on public.reasonai_conversations
  for select using (user_id = auth.uid());
create policy reasonai_conversations_insert_own on public.reasonai_conversations
  for insert with check (user_id = auth.uid());
create policy reasonai_conversations_update_own on public.reasonai_conversations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reasonai_conversations_delete_own on public.reasonai_conversations
  for delete using (user_id = auth.uid());

create policy reasonai_messages_select_own on public.reasonai_messages
  for select using (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_messages.conversation_id and c.user_id = auth.uid()
  ));
create policy reasonai_messages_insert_own on public.reasonai_messages
  for insert with check (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_messages.conversation_id and c.user_id = auth.uid()
  ));
create policy reasonai_messages_update_own on public.reasonai_messages
  for update using (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_messages.conversation_id and c.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_messages.conversation_id and c.user_id = auth.uid()
  ));
create policy reasonai_messages_delete_own on public.reasonai_messages
  for delete using (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_messages.conversation_id and c.user_id = auth.uid()
  ));

create policy reasonai_runs_select_own on public.reasonai_runs
  for select using (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_runs.conversation_id and c.user_id = auth.uid()
  ));
create policy reasonai_runs_insert_own on public.reasonai_runs
  for insert with check (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_runs.conversation_id and c.user_id = auth.uid()
  ));
create policy reasonai_runs_update_own on public.reasonai_runs
  for update using (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_runs.conversation_id and c.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_runs.conversation_id and c.user_id = auth.uid()
  ));
create policy reasonai_runs_delete_own on public.reasonai_runs
  for delete using (exists (
    select 1 from public.reasonai_conversations c
    where c.id = reasonai_runs.conversation_id and c.user_id = auth.uid()
  ));

comment on table public.reasonai_messages is
  'Canonical product transcript. It is not LangGraph checkpoint or trusted agent memory.';
comment on column public.reasonai_messages.parts is
  'Validated ReasonAI runtime parts only; never raw provider SSE or raw tool arguments.';
comment on table public.reasonai_runs is
  'Requests may identify stale running rows from started_at/updated_at; PR4 intentionally adds no background cleanup.';
