create index ix_user_knowledge_sources_source_id
    on public.user_knowledge_sources (source_id);

create index ix_user_story_events_story_id
    on public.user_story_events (story_id);

create index ix_user_story_state_story_id
    on public.user_story_state (story_id);
