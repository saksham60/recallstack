"""Add Knowledge Shorts persistence and source registry.

Revision ID: 20260926_0018
Revises: 20260815_0017
Create Date: 2026-09-26
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260926_0018"
down_revision: str | None = "20260815_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TABLES = (
    "knowledge_sources",
    "knowledge_stories",
    "knowledge_story_topics",
    "user_knowledge_preferences",
    "user_knowledge_topics",
    "user_knowledge_sources",
    "user_story_events",
    "user_story_state",
)


def upgrade() -> None:
    # CREATE IF NOT EXISTS makes this safe for production, where Supabase schema ownership
    # preceded the repository migration. Fresh environments get the same contract.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.knowledge_sources (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            key varchar(80) NOT NULL UNIQUE,
            name varchar(160) NOT NULL,
            source_type varchar(40) NOT NULL,
            homepage_url text NULL,
            enabled boolean NOT NULL DEFAULT true,
            quality_weight numeric(5,4) NOT NULL DEFAULT 1.0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT chk_knowledge_sources_quality_weight
                CHECK (quality_weight >= 0 AND quality_weight <= 1)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.knowledge_stories (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE RESTRICT,
            external_id varchar(255) NULL,
            canonical_url text NOT NULL,
            canonical_hash varchar(64) NOT NULL UNIQUE,
            title varchar(500) NOT NULL,
            summary text NOT NULL,
            why_it_matters text NOT NULL,
            bullets text[] NOT NULL DEFAULT '{}'::text[],
            image_url text NOT NULL,
            image_key text NOT NULL UNIQUE,
            published_at timestamptz NOT NULL,
            discovered_at timestamptz NOT NULL DEFAULT now(),
            importance_score numeric(5,4) NOT NULL,
            quality_score numeric(5,4) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'active',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT chk_knowledge_stories_importance_score
                CHECK (importance_score >= 0 AND importance_score <= 1),
            CONSTRAINT chk_knowledge_stories_quality_score
                CHECK (quality_score >= 0 AND quality_score <= 1),
            CONSTRAINT chk_knowledge_stories_bullets_count
                CHECK (cardinality(bullets) <= 3),
            CONSTRAINT chk_knowledge_stories_status
                CHECK (status IN ('active', 'expired', 'rejected'))
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.knowledge_story_topics (
            story_id uuid NOT NULL REFERENCES public.knowledge_stories(id) ON DELETE CASCADE,
            topic varchar(80) NOT NULL,
            confidence numeric(5,4) NOT NULL DEFAULT 1.0,
            PRIMARY KEY (story_id, topic),
            CONSTRAINT chk_knowledge_story_topics_confidence
                CHECK (confidence >= 0 AND confidence <= 1)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.user_knowledge_preferences (
            profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
            minimum_importance numeric(5,4) NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT chk_user_knowledge_preferences_minimum_importance
                CHECK (minimum_importance >= 0 AND minimum_importance <= 1)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.user_knowledge_topics (
            profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            topic varchar(80) NOT NULL,
            weight numeric(6,4) NOT NULL DEFAULT 1.0,
            blocked boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (profile_id, topic)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.user_knowledge_sources (
            profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
            enabled boolean NOT NULL DEFAULT true,
            weight numeric(6,4) NOT NULL DEFAULT 1.0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (profile_id, source_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.user_story_events (
            id uuid PRIMARY KEY,
            profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            story_id uuid NOT NULL REFERENCES public.knowledge_stories(id) ON DELETE CASCADE,
            event_type varchar(30) NOT NULL,
            occurred_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT chk_user_story_events_event_type CHECK (
                event_type IN ('VIEW', 'OPEN', 'SAVE', 'UNSAVE', 'HIDE', 'UNHIDE', 'SHARE', 'ASK_REASONAI')
            )
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.user_story_state (
            profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
            story_id uuid NOT NULL REFERENCES public.knowledge_stories(id) ON DELETE CASCADE,
            seen_at timestamptz NULL,
            saved boolean NOT NULL DEFAULT false,
            hidden boolean NOT NULL DEFAULT false,
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (profile_id, story_id)
        )
        """
    )

    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_stories_source_external_id "
        "ON public.knowledge_stories (source_id, external_id) WHERE external_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_knowledge_stories_status_published "
        "ON public.knowledge_stories (status, published_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_knowledge_stories_status_importance_published "
        "ON public.knowledge_stories (status, importance_score DESC, published_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_knowledge_stories_source_status_published "
        "ON public.knowledge_stories (source_id, status, published_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_knowledge_story_topics_topic_story "
        "ON public.knowledge_story_topics (topic, story_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_knowledge_topics_profile_blocked_topic "
        "ON public.user_knowledge_topics (profile_id, blocked, topic)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_knowledge_sources_source_id "
        "ON public.user_knowledge_sources (source_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_story_events_profile_story_occurred "
        "ON public.user_story_events (profile_id, story_id, occurred_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_story_events_profile_occurred "
        "ON public.user_story_events (profile_id, occurred_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_story_events_story_id "
        "ON public.user_story_events (story_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_story_state_profile_hidden_story "
        "ON public.user_story_state (profile_id, hidden, story_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_story_state_story_id "
        "ON public.user_story_state (story_id)"
    )

    op.execute(
        """
        INSERT INTO public.knowledge_sources
            (key, name, source_type, homepage_url, enabled, quality_weight)
        VALUES
            ('web', 'Web', 'web', NULL, true, 0.8500),
            ('hacker_news', 'Hacker News', 'hacker_news', 'https://news.ycombinator.com', true, 0.9500)
        ON CONFLICT (key) DO NOTHING
        """
    )

    for table in _TABLES:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")

    # Production uses these tables only through FastAPI's PostgreSQL connection.
    op.execute(
        """
        DO $$
        DECLARE table_name text;
        BEGIN
            FOREACH table_name IN ARRAY ARRAY[
                'knowledge_sources', 'knowledge_stories', 'knowledge_story_topics',
                'user_knowledge_preferences', 'user_knowledge_topics', 'user_knowledge_sources',
                'user_story_events', 'user_story_state'
            ]
            LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
                END IF;
            END LOOP;
        END $$
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.user_story_state")
    op.execute("DROP TABLE IF EXISTS public.user_story_events")
    op.execute("DROP TABLE IF EXISTS public.user_knowledge_sources")
    op.execute("DROP TABLE IF EXISTS public.user_knowledge_topics")
    op.execute("DROP TABLE IF EXISTS public.user_knowledge_preferences")
    op.execute("DROP TABLE IF EXISTS public.knowledge_story_topics")
    op.execute("DROP TABLE IF EXISTS public.knowledge_stories")
    op.execute("DROP TABLE IF EXISTS public.knowledge_sources")
