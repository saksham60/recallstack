create table public.knowledge_sources (
    id uuid primary key default gen_random_uuid(),
    key varchar(80) not null unique,
    name varchar(160) not null,
    source_type varchar(40) not null,
    homepage_url text null,
    enabled boolean not null default true,
    quality_weight numeric(5,4) not null default 1.0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_knowledge_sources_quality_weight check (quality_weight >= 0 and quality_weight <= 1)
);

create table public.knowledge_stories (
    id uuid primary key default gen_random_uuid(),
    source_id uuid not null references public.knowledge_sources(id) on delete restrict,
    external_id varchar(255) null,
    canonical_url text not null,
    canonical_hash varchar(64) not null unique,
    title varchar(500) not null,
    summary text not null,
    why_it_matters text not null,
    bullets text[] not null default '{}'::text[],
    image_url text not null,
    image_key text not null unique,
    published_at timestamptz not null,
    discovered_at timestamptz not null default now(),
    importance_score numeric(5,4) not null,
    quality_score numeric(5,4) not null,
    status varchar(20) not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_knowledge_stories_importance_score check (importance_score >= 0 and importance_score <= 1),
    constraint chk_knowledge_stories_quality_score check (quality_score >= 0 and quality_score <= 1),
    constraint chk_knowledge_stories_bullets_count check (cardinality(bullets) <= 3),
    constraint chk_knowledge_stories_status check (status in ('active', 'expired', 'rejected'))
);

create unique index uq_knowledge_stories_source_external_id
    on public.knowledge_stories (source_id, external_id)
    where external_id is not null;

create index ix_knowledge_stories_status_published
    on public.knowledge_stories (status, published_at desc);

create index ix_knowledge_stories_status_importance_published
    on public.knowledge_stories (status, importance_score desc, published_at desc);

create index ix_knowledge_stories_source_status_published
    on public.knowledge_stories (source_id, status, published_at desc);

create table public.knowledge_story_topics (
    story_id uuid not null references public.knowledge_stories(id) on delete cascade,
    topic varchar(80) not null,
    confidence numeric(5,4) not null default 1.0,
    primary key (story_id, topic),
    constraint chk_knowledge_story_topics_confidence check (confidence >= 0 and confidence <= 1)
);

create index ix_knowledge_story_topics_topic_story
    on public.knowledge_story_topics (topic, story_id);

create table public.user_knowledge_preferences (
    profile_id uuid primary key references public.profiles(id) on delete cascade,
    minimum_importance numeric(5,4) not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_user_knowledge_preferences_minimum_importance check (
        minimum_importance >= 0 and minimum_importance <= 1
    )
);

create table public.user_knowledge_topics (
    profile_id uuid not null references public.profiles(id) on delete cascade,
    topic varchar(80) not null,
    weight numeric(6,4) not null default 1.0,
    blocked boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (profile_id, topic)
);

create index ix_user_knowledge_topics_profile_blocked_topic
    on public.user_knowledge_topics (profile_id, blocked, topic);

create table public.user_knowledge_sources (
    profile_id uuid not null references public.profiles(id) on delete cascade,
    source_id uuid not null references public.knowledge_sources(id) on delete cascade,
    enabled boolean not null default true,
    weight numeric(6,4) not null default 1.0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (profile_id, source_id)
);

create table public.user_story_events (
    id uuid primary key,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    story_id uuid not null references public.knowledge_stories(id) on delete cascade,
    event_type varchar(30) not null,
    occurred_at timestamptz not null,
    created_at timestamptz not null default now(),
    constraint chk_user_story_events_event_type check (
        event_type in ('VIEW','OPEN','SAVE','UNSAVE','HIDE','UNHIDE','SHARE','ASK_REASONAI')
    )
);

create index ix_user_story_events_profile_story_occurred
    on public.user_story_events (profile_id, story_id, occurred_at desc);

create index ix_user_story_events_profile_occurred
    on public.user_story_events (profile_id, occurred_at desc);

create table public.user_story_state (
    profile_id uuid not null references public.profiles(id) on delete cascade,
    story_id uuid not null references public.knowledge_stories(id) on delete cascade,
    seen_at timestamptz null,
    saved boolean not null default false,
    hidden boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (profile_id, story_id)
);

create index ix_user_story_state_profile_hidden_story
    on public.user_story_state (profile_id, hidden, story_id);

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_stories enable row level security;
alter table public.knowledge_story_topics enable row level security;
alter table public.user_knowledge_preferences enable row level security;
alter table public.user_knowledge_topics enable row level security;
alter table public.user_knowledge_sources enable row level security;
alter table public.user_story_events enable row level security;
alter table public.user_story_state enable row level security;

revoke all on table public.knowledge_sources from anon, authenticated;
revoke all on table public.knowledge_stories from anon, authenticated;
revoke all on table public.knowledge_story_topics from anon, authenticated;
revoke all on table public.user_knowledge_preferences from anon, authenticated;
revoke all on table public.user_knowledge_topics from anon, authenticated;
revoke all on table public.user_knowledge_sources from anon, authenticated;
revoke all on table public.user_story_events from anon, authenticated;
revoke all on table public.user_story_state from anon, authenticated;

