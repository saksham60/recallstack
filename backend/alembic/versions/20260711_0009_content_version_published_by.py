"""Add direct publisher attribution to content versions.

Revision ID: 20260711_0009
Revises: 20260711_0008
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260711_0009"
down_revision: str | Sequence[str] | None = "20260711_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("content_versions", sa.Column("published_by", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_content_versions_published_by_profiles",
        "content_versions",
        "profiles",
        ["published_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.execute(
        "UPDATE content_versions v SET published_by = h.changed_by "
        "FROM content_version_status_history h "
        "WHERE v.status = 'published' AND v.published_by IS NULL "
        "AND h.content_version_id = v.id AND h.to_status = 'published' "
        "AND h.changed_by IS NOT NULL"
    )
    missing = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT count(*) FROM content_versions WHERE status = 'published' AND published_by IS NULL"
            )
        )
        .scalar_one()
    )
    if missing:
        raise RuntimeError(f"Cannot attribute {missing} published content version(s)")
    op.create_check_constraint(
        "chk_content_version_published_at_by",
        "content_versions",
        "status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL)",
    )
    op.create_index(
        "ix_content_versions_published_by",
        "content_versions",
        ["published_by"],
        postgresql_where=sa.text("published_by IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_content_versions_published_by", table_name="content_versions")
    op.drop_constraint("chk_content_version_published_at_by", "content_versions", type_="check")
    op.drop_constraint(
        "fk_content_versions_published_by_profiles", "content_versions", type_="foreignkey"
    )
    op.drop_column("content_versions", "published_by")
