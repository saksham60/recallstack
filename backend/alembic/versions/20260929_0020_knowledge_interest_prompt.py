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
        "ADD COLUMN interest_prompt text NOT NULL DEFAULT ''"
    )
    op.execute(
        "ALTER TABLE public.user_knowledge_preferences "
        "ADD CONSTRAINT chk_user_knowledge_interest_prompt_length "
        "CHECK (char_length(interest_prompt) <= 500)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE public.user_knowledge_preferences "
        "DROP CONSTRAINT chk_user_knowledge_interest_prompt_length"
    )
    op.execute("ALTER TABLE public.user_knowledge_preferences DROP COLUMN interest_prompt")
