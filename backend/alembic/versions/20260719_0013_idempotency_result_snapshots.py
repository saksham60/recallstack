"""Persist immutable command results for exact idempotent retries.

Revision ID: 20260719_0013
Revises: 20260719_0012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260719_0013"
down_revision: str | None = "20260719_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "practice_attempts",
        sa.Column(
            "result_progress",
            postgresql.ENUM(name="learning_status", create_type=False),
            nullable=True,
        ),
    )
    op.add_column(
        "practice_attempts", sa.Column("result_confidence", sa.SmallInteger(), nullable=True)
    )
    op.add_column("practice_attempts", sa.Column("result_review_card_id", sa.UUID(), nullable=True))
    op.add_column(
        "practice_attempts",
        sa.Column("result_next_review_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_practice_attempts_result_review_card",
        "practice_attempts",
        "review_cards",
        ["result_review_card_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_practice_attempts_result_review_card",
        "practice_attempts",
        ["result_review_card_id"],
        postgresql_where=sa.text("result_review_card_id IS NOT NULL"),
    )
    op.create_check_constraint(
        "chk_practice_attempt_result_snapshot",
        "practice_attempts",
        "(result_progress IS NULL AND result_confidence IS NULL "
        "AND result_review_card_id IS NULL AND result_next_review_at IS NULL) OR "
        "(result_progress IS NOT NULL AND result_confidence BETWEEN 0 AND 100 "
        "AND result_review_card_id IS NOT NULL AND result_next_review_at IS NOT NULL)",
    )
    # Best-effort compatibility for historical rows. New writes always store the immutable
    # snapshot. A historical attempt is only backfilled when its aggregate is complete.
    op.execute(
        """
        UPDATE practice_attempts AS attempt
        SET result_progress = progress.status,
            result_confidence = progress.confidence,
            result_review_card_id = card.id,
            result_next_review_at = card.due_at
        FROM user_progress AS progress, review_cards AS card
        WHERE progress.user_id = attempt.user_id
          AND progress.content_item_id = attempt.content_item_id
          AND card.user_id = attempt.user_id
          AND card.content_item_id = attempt.content_item_id
          AND attempt.result_progress IS NULL
        """
    )

    op.add_column("sync_mutations", sa.Column("result_cursor", sa.BigInteger(), nullable=True))
    op.add_column("sync_mutations", sa.Column("result_payload", postgresql.JSONB(), nullable=True))
    op.create_check_constraint(
        "chk_sync_mutation_result_cursor",
        "sync_mutations",
        "result_cursor IS NULL OR result_cursor > 0",
    )


def downgrade() -> None:
    op.drop_constraint("chk_sync_mutation_result_cursor", "sync_mutations", type_="check")
    op.drop_column("sync_mutations", "result_payload")
    op.drop_column("sync_mutations", "result_cursor")
    op.drop_constraint("chk_practice_attempt_result_snapshot", "practice_attempts", type_="check")
    op.drop_constraint(
        "fk_practice_attempts_result_review_card", "practice_attempts", type_="foreignkey"
    )
    op.drop_index("ix_practice_attempts_result_review_card", table_name="practice_attempts")
    op.drop_column("practice_attempts", "result_next_review_at")
    op.drop_column("practice_attempts", "result_review_card_id")
    op.drop_column("practice_attempts", "result_confidence")
    op.drop_column("practice_attempts", "result_progress")
