"""Add persisted full-resync snapshots and scheduled-review ordering index.

Revision ID: 20260726_0014
Revises: 20260719_0013
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260726_0014"
down_revision: str | None = "20260719_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "full_resync_snapshots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stream_type", sa.String(length=20), nullable=False),
        sa.Column("domain_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("snapshot_cursor", sa.BigInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "stream_type IN ('catalog', 'user')",
            name="chk_full_resync_snapshots_stream",
        ),
        sa.CheckConstraint(
            "(stream_type = 'catalog' AND domain_id IS NOT NULL) OR "
            "(stream_type = 'user' AND domain_id IS NULL)",
            name="chk_full_resync_snapshots_domain",
        ),
        sa.CheckConstraint(
            "snapshot_cursor >= 0",
            name="chk_full_resync_snapshots_cursor",
        ),
        sa.CheckConstraint(
            "expires_at > created_at",
            name="chk_full_resync_snapshots_expiry",
        ),
        sa.ForeignKeyConstraint(
            ["device_id", "user_id"],
            ["devices.id", "devices.user_id"],
            name="fk_full_resync_snapshots_device_user",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id"],
            ["domains.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["profiles.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_full_resync_snapshots_owner_stream",
        "full_resync_snapshots",
        ["user_id", "device_id", "stream_type", "domain_id"],
    )
    op.create_index(
        "ix_full_resync_snapshots_expires_at",
        "full_resync_snapshots",
        ["expires_at"],
    )
    op.create_index(
        "ix_full_resync_snapshots_device_user",
        "full_resync_snapshots",
        ["device_id", "user_id"],
    )
    op.create_index(
        "ix_full_resync_snapshots_domain_id",
        "full_resync_snapshots",
        ["domain_id"],
    )
    op.create_index(
        "ix_review_cards_user_due_id_active",
        "review_cards",
        ["user_id", "due_at", "id"],
        postgresql_where=sa.text("suspended_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_review_cards_user_due_id_active", table_name="review_cards")
    op.drop_index(
        "ix_full_resync_snapshots_domain_id",
        table_name="full_resync_snapshots",
    )
    op.drop_index(
        "ix_full_resync_snapshots_device_user",
        table_name="full_resync_snapshots",
    )
    op.drop_index(
        "ix_full_resync_snapshots_expires_at",
        table_name="full_resync_snapshots",
    )
    op.drop_index(
        "ix_full_resync_snapshots_owner_stream",
        table_name="full_resync_snapshots",
    )
    op.drop_table("full_resync_snapshots")
