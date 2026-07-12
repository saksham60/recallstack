"""Create content authoring, publication, and release tables.

Revision ID: 20260711_0003
Revises: 20260711_0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260711_0003"
down_revision: str | None = "20260711_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

content_type = postgresql.ENUM(
    "problem",
    "concept",
    "pattern",
    "article",
    "architecture",
    "case_study",
    name="content_type",
    create_type=False,
)
difficulty_level = postgresql.ENUM(
    "beginner", "easy", "medium", "hard", "expert", name="difficulty_level", create_type=False
)
publication_status = postgresql.ENUM(
    "draft", "in_review", "published", "archived", name="publication_status", create_type=False
)
block_type = postgresql.ENUM(
    "recognize",
    "remember",
    "invariant",
    "approach",
    "code",
    "mistake",
    "warning",
    "diagram",
    "table",
    "architecture_flow",
    "quiz",
    "related_content",
    "external_link",
    name="block_type",
    create_type=False,
)
content_relation_type = postgresql.ENUM(
    "prerequisite", "related", "alternative", name="content_relation_type", create_type=False
)
release_status = postgresql.ENUM(
    "building", "published", "retired", name="release_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    for enum in (
        content_type,
        difficulty_level,
        publication_status,
        block_type,
        content_relation_type,
        release_status,
    ):
        enum.create(bind, checkfirst=True)
    op.create_table(
        "content_items",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(160), nullable=False),
        sa.Column("type", content_type, nullable=False),
        sa.Column("difficulty", difficulty_level),
        sa.Column("current_published_version_id", sa.Uuid()),
        sa.Column("created_by", sa.Uuid()),
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
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["domain_id"],
            ["domains.id"],
            ondelete="RESTRICT",
            name="fk_content_items_domain_id_domains",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["profiles.id"],
            ondelete="SET NULL",
            name="fk_content_items_created_by_profiles",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_content_items"),
        sa.UniqueConstraint("domain_id", "id", name="uq_content_items_domain_id_id"),
        sa.UniqueConstraint("domain_id", "slug", name="uq_content_items_domain_id_slug"),
    )
    op.create_index("ix_content_items_created_by", "content_items", ["created_by"])
    op.create_index(
        "ix_content_items_public_browse",
        "content_items",
        ["domain_id", "type"],
        postgresql_where=sa.text("archived_at IS NULL"),
    )
    op.create_table(
        "content_versions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", publication_status, server_default="draft", nullable=False),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("search_document", postgresql.TSVECTOR()),
        sa.Column("authored_by", sa.Uuid()),
        sa.Column("reviewed_by", sa.Uuid()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
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
        sa.CheckConstraint("version_number > 0", name="chk_content_version_number_positive"),
        sa.CheckConstraint(
            "status <> 'published' OR published_at IS NOT NULL",
            name="chk_content_version_published_at",
        ),
        sa.CheckConstraint("row_version > 0", name="chk_content_version_row_version"),
        sa.ForeignKeyConstraint(
            ["content_item_id"],
            ["content_items.id"],
            ondelete="CASCADE",
            name="fk_content_versions_content_item_id_content_items",
        ),
        sa.ForeignKeyConstraint(
            ["authored_by"],
            ["profiles.id"],
            ondelete="SET NULL",
            name="fk_content_versions_authored_by_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"],
            ["profiles.id"],
            ondelete="SET NULL",
            name="fk_content_versions_reviewed_by_profiles",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_content_versions"),
        sa.UniqueConstraint("content_item_id", "id", name="uq_content_versions_content_item_id_id"),
        sa.UniqueConstraint(
            "content_item_id", "version_number", name="uq_content_versions_item_version"
        ),
    )
    op.create_index("ix_content_versions_authored_by", "content_versions", ["authored_by"])
    op.create_index("ix_content_versions_reviewed_by", "content_versions", ["reviewed_by"])
    op.create_index(
        "ix_content_versions_search_document",
        "content_versions",
        ["search_document"],
        postgresql_using="gin",
    )
    op.create_foreign_key(
        "fk_content_items_current_published_version",
        "content_items",
        "content_versions",
        ["id", "current_published_version_id"],
        ["content_item_id", "id"],
        ondelete="RESTRICT",
        use_alter=True,
    )
    op.create_index(
        "ix_content_items_current_version", "content_items", ["current_published_version_id"]
    )
    op.create_index(
        "ix_content_items_current_ownership",
        "content_items",
        ["id", "current_published_version_id"],
    )
    op.create_table(
        "content_version_status_history",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("content_version_id", sa.Uuid(), nullable=False),
        sa.Column("from_status", publication_status),
        sa.Column("to_status", publication_status, nullable=False),
        sa.Column("changed_by", sa.Uuid()),
        sa.Column("reason", sa.Text()),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["content_version_id"],
            ["content_versions.id"],
            ondelete="CASCADE",
            name="fk_content_version_status_history_version",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by"],
            ["profiles.id"],
            ondelete="SET NULL",
            name="fk_content_version_status_history_changed_by",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_content_version_status_history"),
    )
    op.create_index(
        "ix_content_version_status_history_version",
        "content_version_status_history",
        ["content_version_id"],
    )
    op.create_index(
        "ix_content_version_status_history_changed_by",
        "content_version_status_history",
        ["changed_by"],
    )
    op.create_table(
        "content_blocks",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("type", block_type, nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("plain_text", sa.Text()),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("created_by", sa.Uuid()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(content_hash) = 64 AND content_hash ~ '^[0-9a-f]{64}$'",
            name="chk_content_blocks_hash",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["profiles.id"],
            ondelete="SET NULL",
            name="fk_content_blocks_created_by_profiles",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_content_blocks"),
        sa.UniqueConstraint("type", "content_hash", name="uq_content_blocks_type_hash"),
    )
    op.create_index("ix_content_blocks_created_by", "content_blocks", ["created_by"])
    op.create_table(
        "content_version_blocks",
        sa.Column("content_version_id", sa.Uuid(), nullable=False),
        sa.Column("content_block_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("heading", sa.String(240)),
        sa.CheckConstraint("position >= 0", name="chk_content_version_blocks_position"),
        sa.ForeignKeyConstraint(
            ["content_version_id"],
            ["content_versions.id"],
            ondelete="CASCADE",
            name="fk_content_version_blocks_version",
        ),
        sa.ForeignKeyConstraint(
            ["content_block_id"],
            ["content_blocks.id"],
            ondelete="RESTRICT",
            name="fk_content_version_blocks_block",
        ),
        sa.PrimaryKeyConstraint("content_version_id", "position", name="pk_content_version_blocks"),
        sa.UniqueConstraint(
            "content_version_id", "content_block_id", name="uq_content_version_blocks_version_block"
        ),
    )
    op.create_index(
        "ix_content_version_blocks_block", "content_version_blocks", ["content_block_id"]
    )
    op.create_table(
        "content_item_categories",
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["domain_id", "content_item_id"],
            ["content_items.domain_id", "content_items.id"],
            ondelete="CASCADE",
            name="fk_content_item_categories_domain_item",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "category_id"],
            ["categories.domain_id", "categories.id"],
            ondelete="CASCADE",
            name="fk_content_item_categories_domain_category",
        ),
        sa.PrimaryKeyConstraint(
            "content_item_id", "category_id", name="pk_content_item_categories"
        ),
    )
    op.create_index(
        "ix_content_item_categories_domain_category",
        "content_item_categories",
        ["domain_id", "category_id"],
    )
    op.create_index(
        "ix_content_item_categories_domain_item",
        "content_item_categories",
        ["domain_id", "content_item_id"],
    )
    op.create_table(
        "content_item_topics",
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["domain_id", "content_item_id"],
            ["content_items.domain_id", "content_items.id"],
            ondelete="CASCADE",
            name="fk_content_item_topics_domain_item",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "topic_id"],
            ["topics.domain_id", "topics.id"],
            ondelete="CASCADE",
            name="fk_content_item_topics_domain_topic",
        ),
        sa.PrimaryKeyConstraint("content_item_id", "topic_id", name="pk_content_item_topics"),
    )
    op.create_index(
        "ix_content_item_topics_domain_topic", "content_item_topics", ["domain_id", "topic_id"]
    )
    op.create_index(
        "ix_content_item_topics_domain_item",
        "content_item_topics",
        ["domain_id", "content_item_id"],
    )
    op.create_index(
        "uq_content_item_topics_one_primary",
        "content_item_topics",
        ["content_item_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
    )
    op.create_table(
        "content_relations",
        sa.Column("source_content_item_id", sa.Uuid(), nullable=False),
        sa.Column("target_content_item_id", sa.Uuid(), nullable=False),
        sa.Column("relation_type", content_relation_type, nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_content_item_id <> target_content_item_id", name="chk_content_relation_not_self"
        ),
        sa.CheckConstraint(
            "(relation_type NOT IN ('related', 'alternative')) OR (source_content_item_id < target_content_item_id)",
            name="chk_content_relation_canonical_symmetric",
        ),
        sa.ForeignKeyConstraint(
            ["source_content_item_id"],
            ["content_items.id"],
            ondelete="CASCADE",
            name="fk_content_relations_source",
        ),
        sa.ForeignKeyConstraint(
            ["target_content_item_id"],
            ["content_items.id"],
            ondelete="CASCADE",
            name="fk_content_relations_target",
        ),
        sa.PrimaryKeyConstraint(
            "source_content_item_id",
            "target_content_item_id",
            "relation_type",
            name="pk_content_relations",
        ),
    )
    op.create_index("ix_content_relations_target", "content_relations", ["target_content_item_id"])
    op.create_table(
        "catalog_releases",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("release_number", sa.BigInteger(), nullable=False),
        sa.Column("status", release_status, server_default="building", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("published_by", sa.Uuid()),
        sa.Column("retired_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("release_number > 0", name="chk_catalog_release_number_positive"),
        sa.CheckConstraint(
            "status <> 'published' OR published_at IS NOT NULL",
            name="chk_catalog_release_published_at",
        ),
        sa.CheckConstraint(
            "retired_at IS NULL OR published_at IS NOT NULL",
            name="chk_catalog_release_retire_after_publish",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id"],
            ["domains.id"],
            ondelete="RESTRICT",
            name="fk_catalog_releases_domain_id_domains",
        ),
        sa.ForeignKeyConstraint(
            ["published_by"],
            ["profiles.id"],
            ondelete="SET NULL",
            name="fk_catalog_releases_published_by_profiles",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_catalog_releases"),
        sa.UniqueConstraint("domain_id", "id", name="uq_catalog_releases_domain_id_id"),
        sa.UniqueConstraint(
            "domain_id", "release_number", name="uq_catalog_releases_domain_number"
        ),
    )
    op.create_index("ix_catalog_releases_published_by", "catalog_releases", ["published_by"])
    op.create_table(
        "catalog_release_versions",
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("catalog_release_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("content_version_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["domain_id", "catalog_release_id"],
            ["catalog_releases.domain_id", "catalog_releases.id"],
            ondelete="CASCADE",
            name="fk_catalog_release_versions_domain_release",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "content_item_id"],
            ["content_items.domain_id", "content_items.id"],
            ondelete="RESTRICT",
            name="fk_catalog_release_versions_domain_item",
        ),
        sa.ForeignKeyConstraint(
            ["content_item_id", "content_version_id"],
            ["content_versions.content_item_id", "content_versions.id"],
            ondelete="RESTRICT",
            name="fk_catalog_release_versions_item_version",
        ),
        sa.PrimaryKeyConstraint(
            "catalog_release_id", "content_item_id", name="pk_catalog_release_versions"
        ),
    )
    op.create_index(
        "ix_catalog_release_versions_domain_item",
        "catalog_release_versions",
        ["domain_id", "content_item_id"],
    )
    op.create_index(
        "ix_catalog_release_versions_domain_release",
        "catalog_release_versions",
        ["domain_id", "catalog_release_id"],
    )
    op.create_index(
        "ix_catalog_release_versions_item_version",
        "catalog_release_versions",
        ["content_item_id", "content_version_id"],
    )


def downgrade() -> None:
    op.drop_table("catalog_release_versions")
    op.drop_table("catalog_releases")
    op.drop_table("content_relations")
    op.drop_table("content_item_topics")
    op.drop_table("content_item_categories")
    op.drop_table("content_version_blocks")
    op.drop_table("content_blocks")
    op.drop_table("content_version_status_history")
    op.drop_constraint(
        "fk_content_items_current_published_version", "content_items", type_="foreignkey"
    )
    op.drop_table("content_versions")
    op.drop_table("content_items")
    bind = op.get_bind()
    for enum in (
        release_status,
        content_relation_type,
        block_type,
        publication_status,
        difficulty_level,
        content_type,
    ):
        enum.drop(bind, checkfirst=True)
