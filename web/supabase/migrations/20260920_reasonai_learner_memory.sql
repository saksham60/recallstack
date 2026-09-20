-- Compact, cross-conversation learner profile. This is not transcript or LangGraph checkpoint storage.
create table if not exists public.reasonai_learner_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('dsa', 'system_design')),
  memory_type text not null check (memory_type in ('preference', 'strength', 'misconception', 'goal', 'strategy', 'progress')),
  memory_key text not null check (char_length(memory_key) between 1 and 200),
  content text not null check (char_length(content) between 1 and 1000),
  confidence smallint not null check (confidence between 0 and 100),
  source_conversation_id uuid references public.reasonai_conversations(id) on delete set null,
  source_run_id uuid references public.reasonai_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, surface, memory_key)
);

create index if not exists reasonai_learner_memories_user_surface_updated_idx
  on public.reasonai_learner_memories (user_id, surface, updated_at desc, id desc);
create index if not exists reasonai_learner_memories_source_conversation_idx
  on public.reasonai_learner_memories (source_conversation_id) where source_conversation_id is not null;

alter table public.reasonai_learner_memories enable row level security;

drop policy if exists reasonai_learner_memories_select_own on public.reasonai_learner_memories;
create policy reasonai_learner_memories_select_own on public.reasonai_learner_memories
  for select using (auth.uid() = user_id);
drop policy if exists reasonai_learner_memories_insert_own on public.reasonai_learner_memories;
create policy reasonai_learner_memories_insert_own on public.reasonai_learner_memories
  for insert with check (auth.uid() = user_id);
drop policy if exists reasonai_learner_memories_update_own on public.reasonai_learner_memories;
create policy reasonai_learner_memories_update_own on public.reasonai_learner_memories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists reasonai_learner_memories_delete_own on public.reasonai_learner_memories;
create policy reasonai_learner_memories_delete_own on public.reasonai_learner_memories
  for delete using (auth.uid() = user_id);

comment on table public.reasonai_learner_memories is
  'Bounded pedagogical profile extracted after successful ReasonAI turns; never raw transcripts, web payloads, or model reasoning.';
comment on column public.reasonai_learner_memories.memory_key is
  'Stable semantic identity used with user_id and surface for deterministic upsert.';
