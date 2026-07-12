"""Create device and offline synchronization tables.

Revision ID: 20260711_0007
Revises: 20260711_0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260711_0007"
down_revision: str | None = "20260711_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

mutation_operation = postgresql.ENUM(
    "insert", "update", "delete", name="mutation_operation", create_type=False
)
mutation_status = postgresql.ENUM(
    "received", "applied", "rejected", name="mutation_status", create_type=False
)
change_operation = postgresql.ENUM("upsert", "delete", name="change_operation", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    for enum in (mutation_operation, mutation_status, change_operation):
        enum.create(bind, checkfirst=True)
    op.create_table(
        "devices",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("device_name", sa.String(160)),
        sa.Column("platform", sa.String(40), nullable=False),
        sa.Column("app_version", sa.String(40)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column(
            "registered_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["user_id"], ["profiles.id"], ondelete="CASCADE", name="fk_devices_user_id_profiles"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_devices"),
        sa.UniqueConstraint("id", "user_id", name="uq_devices_id_user"),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"])
    op.create_table(
        "device_user_sync_state",
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("last_user_cursor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("last_pull_at", sa.DateTime(timezone=True)),
        sa.Column("last_push_at", sa.DateTime(timezone=True)),
        sa.Column("full_resync_required", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("last_user_cursor >= 0", name="chk_device_user_sync_cursor"),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            ondelete="CASCADE",
            name="fk_device_user_sync_state_device_id_devices",
        ),
        sa.PrimaryKeyConstraint("device_id", name="pk_device_user_sync_state"),
    )
    op.create_table(
        "device_catalog_sync_state",
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("last_catalog_cursor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("last_catalog_release_id", sa.Uuid()),
        sa.Column("full_resync_required", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("last_pull_at", sa.DateTime(timezone=True)),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("last_catalog_cursor >= 0", name="chk_device_catalog_sync_cursor"),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            ondelete="CASCADE",
            name="fk_device_catalog_sync_state_device_id_devices",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id"],
            ["domains.id"],
            ondelete="CASCADE",
            name="fk_device_catalog_sync_state_domain_id_domains",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "last_catalog_release_id"],
            ["catalog_releases.domain_id", "catalog_releases.id"],
            ondelete="RESTRICT",
            name="fk_device_catalog_sync_state_domain_release",
        ),
        sa.PrimaryKeyConstraint("device_id", "domain_id", name="pk_device_catalog_sync_state"),
    )
    op.create_index(
        "ix_device_catalog_sync_state_domain_release",
        "device_catalog_sync_state",
        ["domain_id", "last_catalog_release_id"],
    )
    op.create_table(
        "sync_mutations",
        sa.Column("mutation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(80), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("operation", mutation_operation, nullable=False),
        sa.Column("payload", postgresql.JSONB()),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("status", mutation_status, server_default="received", nullable=False),
        sa.Column("base_row_version", sa.BigInteger()),
        sa.Column("resulting_row_version", sa.BigInteger()),
        sa.Column("error_code", sa.String(80)),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("expires_at > received_at", name="chk_sync_mutation_expiry"),
        sa.CheckConstraint(
            "processed_at IS NULL OR processed_at >= received_at",
            name="chk_sync_mutation_processed_time",
        ),
        sa.CheckConstraint(
            "(status = 'received' AND processed_at IS NULL) OR (status = 'applied' AND processed_at IS NOT NULL) OR (status = 'rejected' AND processed_at IS NOT NULL AND error_code IS NOT NULL)",
            name="chk_sync_mutation_status_consistency",
        ),
        sa.CheckConstraint(
            "base_row_version IS NULL OR base_row_version > 0",
            name="chk_sync_mutation_base_version",
        ),
        sa.CheckConstraint(
            "resulting_row_version IS NULL OR resulting_row_version > 0",
            name="chk_sync_mutation_result_version",
        ),
        sa.CheckConstraint(
            "char_length(request_hash) = 64 AND request_hash ~ '^[0-9a-f]{64}$'",
            name="chk_sync_mutation_request_hash",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["profiles.id"],
            ondelete="CASCADE",
            name="fk_sync_mutations_user_id_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["device_id", "user_id"],
            ["devices.id", "devices.user_id"],
            ondelete="CASCADE",
            name="fk_sync_mutations_device_user",
        ),
        sa.PrimaryKeyConstraint("mutation_id", name="pk_sync_mutations"),
    )
    op.create_index("ix_sync_mutations_user_id", "sync_mutations", ["user_id"])
    op.create_index("ix_sync_mutations_device_user", "sync_mutations", ["device_id", "user_id"])
    op.create_index("ix_sync_mutations_expires_at", "sync_mutations", ["expires_at"])
    op.create_table(
        "user_sync_counters",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("last_cursor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("last_cursor >= 0", name="chk_user_sync_counter_nonnegative"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["profiles.id"],
            ondelete="CASCADE",
            name="fk_user_sync_counters_user_id_profiles",
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_user_sync_counters"),
    )
    op.create_table(
        "user_sync_change_log",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("cursor", sa.BigInteger(), nullable=False),
        sa.Column("entity_type", sa.String(80), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("operation", change_operation, nullable=False),
        sa.Column("entity_version", sa.BigInteger()),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("retain_until", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("cursor > 0", name="chk_user_sync_change_cursor_positive"),
        sa.CheckConstraint("retain_until > changed_at", name="chk_user_sync_change_retention"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["profiles.id"],
            ondelete="CASCADE",
            name="fk_user_sync_change_log_user_id_profiles",
        ),
        sa.PrimaryKeyConstraint("user_id", "cursor", name="pk_user_sync_change_log"),
    )
    op.create_index(
        "ix_user_sync_change_log_retain_until", "user_sync_change_log", ["retain_until"]
    )
    op.create_table(
        "catalog_sync_counters",
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("last_cursor", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("last_cursor >= 0", name="chk_catalog_sync_counter_nonnegative"),
        sa.ForeignKeyConstraint(
            ["domain_id"],
            ["domains.id"],
            ondelete="CASCADE",
            name="fk_catalog_sync_counters_domain_id_domains",
        ),
        sa.PrimaryKeyConstraint("domain_id", name="pk_catalog_sync_counters"),
    )
    op.create_table(
        "catalog_sync_change_log",
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("cursor", sa.BigInteger(), nullable=False),
        sa.Column("entity_type", sa.String(80), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("operation", change_operation, nullable=False),
        sa.Column("entity_version", sa.BigInteger()),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("retain_until", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("cursor > 0", name="chk_catalog_sync_change_cursor_positive"),
        sa.CheckConstraint("retain_until > changed_at", name="chk_catalog_sync_change_retention"),
        sa.ForeignKeyConstraint(
            ["domain_id"],
            ["domains.id"],
            ondelete="CASCADE",
            name="fk_catalog_sync_change_log_domain_id_domains",
        ),
        sa.PrimaryKeyConstraint("domain_id", "cursor", name="pk_catalog_sync_change_log"),
    )
    op.create_index(
        "ix_catalog_sync_change_log_retain_until", "catalog_sync_change_log", ["retain_until"]
    )


def downgrade() -> None:
    op.drop_table("catalog_sync_change_log")
    op.drop_table("catalog_sync_counters")
    op.drop_table("user_sync_change_log")
    op.drop_table("user_sync_counters")
    op.drop_table("sync_mutations")
    op.drop_table("device_catalog_sync_state")
    op.drop_table("device_user_sync_state")
    op.drop_table("devices")
    bind = op.get_bind()
    for enum in (change_operation, mutation_status, mutation_operation):
        enum.drop(bind, checkfirst=True)
