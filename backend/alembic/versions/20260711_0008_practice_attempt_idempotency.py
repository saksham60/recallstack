"""Add a client idempotency key to append-only practice attempts.

Revision ID: 20260711_0008
Revises: 20260711_0007
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260711_0008"
down_revision: str | None = "20260711_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("practice_attempts", sa.Column("attempt_event_id", sa.Uuid(), nullable=True))
    op.execute("UPDATE practice_attempts SET attempt_event_id = gen_random_uuid()")
    op.alter_column("practice_attempts", "attempt_event_id", nullable=False)
    op.create_unique_constraint(
        "uq_practice_attempts_attempt_event_id", "practice_attempts", ["attempt_event_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_practice_attempts_attempt_event_id", "practice_attempts", type_="unique")
    op.drop_column("practice_attempts", "attempt_event_id")
