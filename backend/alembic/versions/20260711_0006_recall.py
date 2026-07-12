"""Create spaced revision tables.

Revision ID: 20260711_0006
Revises: 20260711_0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260711_0006"
down_revision: str | None = "20260711_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

review_rating = postgresql.ENUM(
    "again", "hard", "good", "easy", name="review_rating", create_type=False
)


def upgrade() -> None:
    review_rating.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "review_cards",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("scheduler_name", sa.String(80), server_default="simple", nullable=False),
        sa.Column("scheduler_version", sa.String(40), server_default="1", nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("interval_days", sa.Numeric(12, 4), server_default="0", nullable=False),
        sa.Column("stability", sa.Numeric(12, 6)),
        sa.Column("difficulty", sa.Numeric(12, 6)),
        sa.Column("review_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lapse_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "scheduler_state",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("row_version", sa.BigInteger(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("suspended_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("interval_days >= 0", name="chk_review_card_interval"),
        sa.CheckConstraint("review_count >= 0", name="chk_review_card_review_count"),
        sa.CheckConstraint("lapse_count >= 0", name="chk_review_card_lapse_count"),
        sa.CheckConstraint("row_version > 0", name="chk_review_card_row_version"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["profiles.id"],
            ondelete="CASCADE",
            name="fk_review_cards_user_id_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["content_item_id"],
            ["content_items.id"],
            ondelete="RESTRICT",
            name="fk_review_cards_content_item_id_content_items",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_review_cards"),
        sa.UniqueConstraint("user_id", "content_item_id", name="uq_review_cards_user_content"),
        sa.UniqueConstraint("id", "user_id", name="uq_review_cards_id_user"),
    )
    op.create_index("ix_review_cards_content_item_id", "review_cards", ["content_item_id"])
    op.create_index(
        "ix_review_cards_due_active",
        "review_cards",
        ["user_id", "due_at"],
        postgresql_where=sa.text("suspended_at IS NULL"),
    )
    op.create_table(
        "review_history",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column(
            "review_event_id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("review_card_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rating", review_rating, nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("response_time_ms", sa.Integer()),
        sa.Column("previous_due_at", sa.DateTime(timezone=True)),
        sa.Column("next_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("interval_days_after", sa.Numeric(12, 4)),
        sa.Column("scheduler_name", sa.String(80), nullable=False),
        sa.Column("scheduler_version", sa.String(40), nullable=False),
        sa.Column("scheduler_state_after", postgresql.JSONB()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "response_time_ms IS NULL OR response_time_ms >= 0",
            name="chk_review_history_response_time",
        ),
        sa.CheckConstraint(
            "interval_days_after IS NULL OR interval_days_after >= 0",
            name="chk_review_history_interval",
        ),
        sa.ForeignKeyConstraint(
            ["review_card_id", "user_id"],
            ["review_cards.id", "review_cards.user_id"],
            ondelete="CASCADE",
            name="fk_review_history_card_user",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_review_history"),
        sa.UniqueConstraint("review_event_id", name="uq_review_history_review_event_id"),
    )
    op.create_index("ix_review_history_card_user", "review_history", ["review_card_id", "user_id"])
    op.create_index(
        "ix_review_history_user_reviewed",
        "review_history",
        ["user_id", sa.text("reviewed_at DESC")],
    )


def downgrade() -> None:
    op.drop_table("review_history")
    op.drop_table("review_cards")
    review_rating.drop(op.get_bind(), checkfirst=True)
