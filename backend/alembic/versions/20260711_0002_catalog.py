"""Create catalog and taxonomy tables.

Revision ID: 20260711_0002
Revises: 20260711_0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260711_0002"
down_revision: str | None = "20260711_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

topic_kind = postgresql.ENUM("topic", "pattern", name="topic_kind", create_type=False)


def upgrade() -> None:
    topic_kind.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "domains",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_domains"),
        sa.UniqueConstraint("slug", name="uq_domains_slug"),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("parent_category_id", sa.Uuid()),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
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
            "parent_category_id IS NULL OR parent_category_id <> id",
            name="chk_category_not_self_parent",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id"],
            ["domains.id"],
            ondelete="RESTRICT",
            name="fk_categories_domain_id_domains",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_categories"),
        sa.UniqueConstraint("domain_id", "id", name="uq_categories_domain_id_id"),
        sa.UniqueConstraint("domain_id", "slug", name="uq_categories_domain_id_slug"),
    )
    op.create_foreign_key(
        "fk_categories_domain_parent_category",
        "categories",
        "categories",
        ["domain_id", "parent_category_id"],
        ["domain_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_categories_domain_parent", "categories", ["domain_id", "parent_category_id"]
    )
    op.create_table(
        "topics",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("kind", topic_kind, server_default="topic", nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text()),
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
        sa.ForeignKeyConstraint(
            ["domain_id"], ["domains.id"], ondelete="RESTRICT", name="fk_topics_domain_id_domains"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_topics"),
        sa.UniqueConstraint("domain_id", "id", name="uq_topics_domain_id_id"),
        sa.UniqueConstraint("domain_id", "slug", name="uq_topics_domain_id_slug"),
    )
    op.create_table(
        "topic_categories",
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["domain_id", "topic_id"],
            ["topics.domain_id", "topics.id"],
            ondelete="CASCADE",
            name="fk_topic_categories_domain_topic",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "category_id"],
            ["categories.domain_id", "categories.id"],
            ondelete="CASCADE",
            name="fk_topic_categories_domain_category",
        ),
        sa.PrimaryKeyConstraint("topic_id", "category_id", name="pk_topic_categories"),
    )
    op.create_index(
        "ix_topic_categories_domain_category", "topic_categories", ["domain_id", "category_id"]
    )
    op.create_index(
        "ix_topic_categories_domain_topic", "topic_categories", ["domain_id", "topic_id"]
    )


def downgrade() -> None:
    op.drop_table("topic_categories")
    op.drop_table("topics")
    op.drop_constraint("fk_categories_domain_parent_category", "categories", type_="foreignkey")
    op.drop_table("categories")
    op.drop_table("domains")
    topic_kind.drop(op.get_bind(), checkfirst=True)
