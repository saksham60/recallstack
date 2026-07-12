"""Create learning state and activity tables.

Revision ID: 20260711_0004
Revises: 20260711_0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260711_0004"
down_revision: str | None = "20260711_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

learning_status = postgresql.ENUM(
    "new",
    "learning",
    "attempted",
    "confident",
    "mastered",
    name="learning_status",
    create_type=False,
)
note_kind = postgresql.ENUM("note", "mistake", "insight", name="note_kind", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    learning_status.create(bind, checkfirst=True)
    note_kind.create(bind, checkfirst=True)
    op.create_table(
        "user_progress",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("status", learning_status, server_default="new", nullable=False),
        sa.Column("confidence", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("last_opened_at", sa.DateTime(timezone=True)),
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
        sa.CheckConstraint("confidence BETWEEN 0 AND 100", name="chk_user_progress_confidence"),
        sa.CheckConstraint("row_version > 0", name="chk_user_progress_row_version"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["profiles.id"],
            ondelete="CASCADE",
            name="fk_user_progress_user_id_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["content_item_id"],
            ["content_items.id"],
            ondelete="RESTRICT",
            name="fk_user_progress_content_item_id_content_items",
        ),
        sa.PrimaryKeyConstraint("user_id", "content_item_id", name="pk_user_progress"),
    )
    op.create_index("ix_user_progress_content_item_id", "user_progress", ["content_item_id"])
    op.create_table(
        "bookmarks",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["profiles.id"], ondelete="CASCADE", name="fk_bookmarks_user_id_profiles"
        ),
        sa.ForeignKeyConstraint(
            ["content_item_id"],
            ["content_items.id"],
            ondelete="RESTRICT",
            name="fk_bookmarks_content_item_id_content_items",
        ),
        sa.PrimaryKeyConstraint("user_id", "content_item_id", name="pk_bookmarks"),
    )
    op.create_index("ix_bookmarks_content_item_id", "bookmarks", ["content_item_id"])
    op.create_table(
        "user_notes",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("kind", note_kind, nullable=False),
        sa.Column("title", sa.String(240)),
        sa.Column("body", sa.Text(), nullable=False),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("row_version > 0", name="chk_user_note_row_version"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["profiles.id"], ondelete="CASCADE", name="fk_user_notes_user_id_profiles"
        ),
        sa.ForeignKeyConstraint(
            ["content_item_id"],
            ["content_items.id"],
            ondelete="RESTRICT",
            name="fk_user_notes_content_item_id_content_items",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_notes"),
    )
    op.create_index("ix_user_notes_content_item_id", "user_notes", ["content_item_id"])
    op.create_index("ix_user_notes_user_id", "user_notes", ["user_id"])
    op.create_index(
        "ix_user_notes_active_user_content",
        "user_notes",
        ["user_id", "content_item_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_user_notes_deleted_user_updated",
        "user_notes",
        ["user_id", "updated_at"],
        postgresql_where=sa.text("deleted_at IS NOT NULL"),
    )
    op.create_table(
        "activity_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid()),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("source_entity_type", sa.String(80)),
        sa.Column("source_entity_id", sa.Uuid()),
        sa.Column("metadata", postgresql.JSONB()),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["profiles.id"],
            ondelete="CASCADE",
            name="fk_activity_events_user_id_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["content_item_id"],
            ["content_items.id"],
            ondelete="SET NULL",
            name="fk_activity_events_content_item_id_content_items",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_activity_events"),
    )
    op.create_index(
        "ix_activity_events_user_occurred",
        "activity_events",
        ["user_id", sa.text("occurred_at DESC")],
    )
    op.create_index("ix_activity_events_content_item_id", "activity_events", ["content_item_id"])


def downgrade() -> None:
    op.drop_table("activity_events")
    op.drop_table("user_notes")
    op.drop_table("bookmarks")
    op.drop_table("user_progress")
    bind = op.get_bind()
    note_kind.drop(bind, checkfirst=True)
    learning_status.drop(bind, checkfirst=True)
