"""Version content category and topic assignments.

Revision ID: 20260719_0012
Revises: 20260717_0011
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260719_0012"
down_revision: str | None = "20260717_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "content_version_categories",
        sa.Column("content_version_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint("sort_order >= 0", name="chk_content_version_categories_sort_order"),
        sa.ForeignKeyConstraint(
            ["content_item_id", "content_version_id"],
            ["content_versions.content_item_id", "content_versions.id"],
            name="fk_content_version_categories_version_owner",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "content_item_id"],
            ["content_items.domain_id", "content_items.id"],
            name="fk_content_version_categories_domain_item",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "category_id"],
            ["categories.domain_id", "categories.id"],
            name="fk_content_version_categories_domain_category",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "content_version_id", "category_id", name="pk_content_version_categories"
        ),
    )
    op.create_index(
        "ix_content_version_categories_domain_category",
        "content_version_categories",
        ["domain_id", "category_id", "content_version_id"],
    )
    op.create_index(
        "ix_content_version_categories_item_version",
        "content_version_categories",
        ["content_item_id", "content_version_id"],
    )
    op.create_index(
        "ix_content_version_categories_domain_item",
        "content_version_categories",
        ["domain_id", "content_item_id"],
    )

    op.create_table(
        "content_version_topics",
        sa.Column("content_version_id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.Uuid(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint("sort_order >= 0", name="chk_content_version_topics_sort_order"),
        sa.ForeignKeyConstraint(
            ["content_item_id", "content_version_id"],
            ["content_versions.content_item_id", "content_versions.id"],
            name="fk_content_version_topics_version_owner",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "content_item_id"],
            ["content_items.domain_id", "content_items.id"],
            name="fk_content_version_topics_domain_item",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["domain_id", "topic_id"],
            ["topics.domain_id", "topics.id"],
            name="fk_content_version_topics_domain_topic",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("content_version_id", "topic_id", name="pk_content_version_topics"),
    )
    op.create_index(
        "ix_content_version_topics_domain_topic",
        "content_version_topics",
        ["domain_id", "topic_id", "content_version_id"],
    )
    op.create_index(
        "ix_content_version_topics_item_version",
        "content_version_topics",
        ["content_item_id", "content_version_id"],
    )
    op.create_index(
        "ix_content_version_topics_domain_item",
        "content_version_topics",
        ["domain_id", "content_item_id"],
    )
    op.create_index(
        "uq_content_version_topics_one_primary",
        "content_version_topics",
        ["content_version_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
    )

    # The legacy mappings had no historical dimension. Copy their complete state to every
    # existing version so no assignment is lost and every published version remains readable.
    op.execute(
        """
        INSERT INTO content_version_categories
          (content_version_id, content_item_id, domain_id, category_id, sort_order)
        SELECT version.id, version.content_item_id, item.domain_id,
               mapping.category_id, mapping.sort_order
        FROM content_versions AS version
        JOIN content_items AS item ON item.id = version.content_item_id
        JOIN content_item_categories AS mapping
          ON mapping.content_item_id = item.id
         AND mapping.domain_id = item.domain_id
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO content_version_topics
          (content_version_id, content_item_id, domain_id, topic_id, is_primary, sort_order)
        SELECT version.id, version.content_item_id, item.domain_id,
               mapping.topic_id, mapping.is_primary, mapping.sort_order
        FROM content_versions AS version
        JOIN content_items AS item ON item.id = version.content_item_id
        JOIN content_item_topics AS mapping
          ON mapping.content_item_id = item.id
         AND mapping.domain_id = item.domain_id
        ON CONFLICT DO NOTHING
        """
    )
    _install_versioned_search_function()
    op.execute("SELECT refresh_content_version_search_document(id) FROM content_versions")


def downgrade() -> None:
    _install_legacy_search_function()
    op.execute("SELECT refresh_content_version_search_document(id) FROM content_versions")
    op.drop_index("uq_content_version_topics_one_primary", table_name="content_version_topics")
    op.drop_index("ix_content_version_topics_domain_item", table_name="content_version_topics")
    op.drop_index("ix_content_version_topics_item_version", table_name="content_version_topics")
    op.drop_index("ix_content_version_topics_domain_topic", table_name="content_version_topics")
    op.drop_table("content_version_topics")
    op.drop_index(
        "ix_content_version_categories_domain_item", table_name="content_version_categories"
    )
    op.drop_index(
        "ix_content_version_categories_item_version", table_name="content_version_categories"
    )
    op.drop_index(
        "ix_content_version_categories_domain_category",
        table_name="content_version_categories",
    )
    op.drop_table("content_version_categories")


def _install_versioned_search_function() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_content_version_search_document(target_version_id uuid)
        RETURNS void LANGUAGE sql AS $$
          UPDATE content_versions AS version
          SET search_document =
            setweight(to_tsvector('english', coalesce(version.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(version.summary, '')), 'B') ||
            setweight(to_tsvector('english', coalesce((
              SELECT string_agg(block.plain_text, ' ' ORDER BY version_block.position)
              FROM content_version_blocks AS version_block
              JOIN content_blocks AS block ON block.id = version_block.content_block_id
              WHERE version_block.content_version_id = version.id
            ), '')), 'C') ||
            setweight(to_tsvector('english', coalesce((
              SELECT string_agg(topic.name, ' ' ORDER BY version_topic.sort_order, topic.name)
              FROM content_version_topics AS version_topic
              JOIN topics AS topic
                ON topic.id = version_topic.topic_id
               AND topic.domain_id = version_topic.domain_id
              WHERE version_topic.content_version_id = version.id
            ), '')), 'C') ||
            setweight(to_tsvector('english', coalesce((
              SELECT string_agg(category.name, ' '
                                ORDER BY version_category.sort_order, category.name)
              FROM content_version_categories AS version_category
              JOIN categories AS category
                ON category.id = version_category.category_id
               AND category.domain_id = version_category.domain_id
              WHERE version_category.content_version_id = version.id
            ), '')), 'C')
          WHERE version.id = target_version_id
        $$
        """
    )


def _install_legacy_search_function() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION refresh_content_version_search_document(target_version_id uuid)
        RETURNS void LANGUAGE sql AS $$
          UPDATE content_versions AS version
          SET search_document =
            setweight(to_tsvector('english', coalesce(version.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(version.summary, '')), 'B') ||
            setweight(to_tsvector('english', coalesce((
              SELECT string_agg(block.plain_text, ' ')
              FROM content_version_blocks AS version_block
              JOIN content_blocks AS block ON block.id = version_block.content_block_id
              WHERE version_block.content_version_id = version.id
            ), '')), 'C') ||
            setweight(to_tsvector('english', coalesce((
              SELECT string_agg(topic.name, ' ')
              FROM content_item_topics AS item_topic
              JOIN topics AS topic
                ON topic.id = item_topic.topic_id
               AND topic.domain_id = item_topic.domain_id
              WHERE item_topic.content_item_id = version.content_item_id
            ), '')), 'C') ||
            setweight(to_tsvector('english', coalesce((
              SELECT string_agg(category.name, ' ')
              FROM content_item_categories AS item_category
              JOIN categories AS category
                ON category.id = item_category.category_id
               AND category.domain_id = item_category.domain_id
              WHERE item_category.content_item_id = version.content_item_id
            ), '')), 'C')
          WHERE version.id = target_version_id
        $$
        """
    )
