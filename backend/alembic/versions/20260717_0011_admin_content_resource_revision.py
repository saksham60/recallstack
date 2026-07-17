"""Add optimistic revisioning for admin-managed practice resources.

Revision ID: 20260717_0011
Revises: 20260711_0010
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260717_0011"
down_revision: str | None = "20260711_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "content_items",
        sa.Column(
            "practice_resources_revision",
            sa.BigInteger(),
            server_default="1",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "chk_content_items_practice_resources_revision",
        "content_items",
        "practice_resources_revision > 0",
    )
    op.alter_column(
        "practice_resources",
        "external_key",
        existing_type=sa.String(length=160),
        type_=sa.String(length=255),
        existing_nullable=True,
    )
    op.alter_column(
        "practice_resources",
        "title",
        existing_type=sa.String(length=240),
        type_=sa.String(length=300),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "practice_resources",
        "title",
        existing_type=sa.String(length=300),
        type_=sa.String(length=240),
        existing_nullable=True,
    )
    op.alter_column(
        "practice_resources",
        "external_key",
        existing_type=sa.String(length=255),
        type_=sa.String(length=160),
        existing_nullable=True,
    )
    op.drop_constraint(
        "chk_content_items_practice_resources_revision",
        "content_items",
        type_="check",
    )
    op.drop_column("content_items", "practice_resources_revision")
