"""Track user-requested Knowledge refreshes and enforce a shared cooldown.

Revision ID: 20260928_0019
Revises: 20260926_0018
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260928_0019"
down_revision: str | None = "20260926_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.knowledge_refresh_runs (
            id uuid PRIMARY KEY,
            requested_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
            requested_at timestamptz NOT NULL,
            status varchar(20) NOT NULL,
            operation_name text NULL,
            checked_at timestamptz NULL,
            CONSTRAINT chk_knowledge_refresh_run_status
                CHECK (status IN ('starting', 'running', 'succeeded', 'failed'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_knowledge_refresh_runs_requested_at "
        "ON public.knowledge_refresh_runs (requested_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_knowledge_refresh_runs_requested_by "
        "ON public.knowledge_refresh_runs (requested_by)"
    )
    op.execute("ALTER TABLE public.knowledge_refresh_runs ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON public.knowledge_refresh_runs FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON public.knowledge_refresh_runs FROM authenticated;
            END IF;
        END $$
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE public.knowledge_refresh_runs")
