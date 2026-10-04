"""Store each reader's free-text Knowledge interest prompt.

Revision ID: 20260929_0020
Revises: 20260928_0019
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260929_0020"
down_revision: str | None = "20260928_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE public.user_knowledge_preferences "
        "ADD COLUMN IF NOT EXISTS interest_prompt text NOT NULL DEFAULT ''"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'chk_user_knowledge_interest_prompt_length'
                  AND conrelid = 'public.user_knowledge_preferences'::regclass
            ) THEN
                ALTER TABLE public.user_knowledge_preferences
                ADD CONSTRAINT chk_user_knowledge_interest_prompt_length
                CHECK (char_length(interest_prompt) <= 500);
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE public.user_knowledge_preferences "
        "DROP CONSTRAINT IF EXISTS chk_user_knowledge_interest_prompt_length"
    )
    op.execute(
        "ALTER TABLE public.user_knowledge_preferences DROP COLUMN IF EXISTS interest_prompt"
    )
