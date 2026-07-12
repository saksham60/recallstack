"""Create practice provider, resource, and attempt tables.

Revision ID: 20260711_0005
Revises: 20260711_0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260711_0005"
down_revision: str | None = "20260711_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

practice_outcome = postgresql.ENUM(
    "solved_independently",
    "solved_with_hint",
    "understood_not_coded",
    "pattern_not_identified",
    "skipped",
    name="practice_outcome",
    create_type=False,
)


def upgrade() -> None:
    practice_outcome.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "practice_providers",
        sa.Column("id", sa.SmallInteger(), sa.Identity(), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("base_url", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_practice_providers"),
        sa.UniqueConstraint("slug", name="uq_practice_providers_slug"),
    )
    op.create_table(
        "practice_resources",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.SmallInteger(), nullable=False),
        sa.Column("external_key", sa.String(160)),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("url_hash", sa.String(64), nullable=False),
        sa.Column("title", sa.String(240)),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
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
        sa.CheckConstraint(
            "char_length(url_hash) = 64 AND url_hash ~ '^[0-9a-f]{64}$'",
            name="chk_practice_resources_url_hash",
        ),
        sa.ForeignKeyConstraint(
            ["content_item_id"],
            ["content_items.id"],
            ondelete="RESTRICT",
            name="fk_practice_resources_content_item_id_content_items",
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["practice_providers.id"],
            ondelete="RESTRICT",
            name="fk_practice_resources_provider_id_practice_providers",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_practice_resources"),
        sa.UniqueConstraint("id", "content_item_id", name="uq_practice_resources_id_content_item"),
        sa.UniqueConstraint("id", "provider_id", name="uq_practice_resources_id_provider"),
        sa.UniqueConstraint(
            "content_item_id",
            "provider_id",
            "url_hash",
            name="uq_practice_resources_item_provider_url",
        ),
    )
    op.create_index("ix_practice_resources_provider_id", "practice_resources", ["provider_id"])
    op.create_index(
        "uq_practice_resources_one_primary",
        "practice_resources",
        ["content_item_id"],
        unique=True,
        postgresql_where=sa.text("is_primary AND archived_at IS NULL"),
    )
    op.create_table(
        "practice_attempts",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("practice_resource_id", sa.Uuid()),
        sa.Column("provider_id", sa.SmallInteger(), nullable=False),
        sa.Column("outcome", practice_outcome, nullable=False),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("hint_used", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("confidence_before", sa.SmallInteger()),
        sa.Column("confidence_after", sa.SmallInteger()),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "duration_seconds IS NULL OR duration_seconds >= 0",
            name="chk_practice_attempt_duration",
        ),
        sa.CheckConstraint(
            "confidence_before IS NULL OR confidence_before BETWEEN 0 AND 100",
            name="chk_practice_attempt_conf_before",
        ),
        sa.CheckConstraint(
            "confidence_after IS NULL OR confidence_after BETWEEN 0 AND 100",
            name="chk_practice_attempt_conf_after",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["profiles.id"],
            ondelete="CASCADE",
            name="fk_practice_attempts_user_id_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["content_item_id"],
            ["content_items.id"],
            ondelete="RESTRICT",
            name="fk_practice_attempts_content_item_id_content_items",
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["practice_providers.id"],
            ondelete="RESTRICT",
            name="fk_practice_attempts_provider_id_practice_providers",
        ),
        sa.ForeignKeyConstraint(
            ["practice_resource_id"],
            ["practice_resources.id"],
            ondelete="RESTRICT",
            name="fk_practice_attempts_resource",
        ),
        sa.ForeignKeyConstraint(
            ["practice_resource_id", "content_item_id"],
            ["practice_resources.id", "practice_resources.content_item_id"],
            ondelete="RESTRICT",
            name="fk_practice_attempts_resource_item",
        ),
        sa.ForeignKeyConstraint(
            ["practice_resource_id", "provider_id"],
            ["practice_resources.id", "practice_resources.provider_id"],
            ondelete="RESTRICT",
            name="fk_practice_attempts_resource_provider",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_practice_attempts"),
    )
    op.create_index(
        "ix_practice_attempts_user_attempted",
        "practice_attempts",
        ["user_id", sa.text("attempted_at DESC")],
    )
    op.create_index(
        "ix_practice_attempts_content_item_id", "practice_attempts", ["content_item_id"]
    )
    op.create_index("ix_practice_attempts_provider_id", "practice_attempts", ["provider_id"])
    op.create_index(
        "ix_practice_attempts_resource_id", "practice_attempts", ["practice_resource_id"]
    )
    op.create_index(
        "ix_practice_attempts_resource_item",
        "practice_attempts",
        ["practice_resource_id", "content_item_id"],
    )
    op.create_index(
        "ix_practice_attempts_resource_provider",
        "practice_attempts",
        ["practice_resource_id", "provider_id"],
    )


def downgrade() -> None:
    op.drop_table("practice_attempts")
    op.drop_table("practice_resources")
    op.drop_table("practice_providers")
    practice_outcome.drop(op.get_bind(), checkfirst=True)
