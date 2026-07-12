"""Add PostgreSQL catalog-search support.

Revision ID: 20260711_0010
Revises: 20260711_0009
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260711_0010"
down_revision: str | None = "20260711_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_content_versions_title_trgm "
        "ON content_versions USING gin (title gin_trgm_ops)"
    )
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
    op.execute("SELECT refresh_content_version_search_document(id) FROM content_versions")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS refresh_content_version_search_document(uuid)")
    op.execute("DROP INDEX IF EXISTS ix_content_versions_title_trgm")
