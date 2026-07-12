"""Create approved identity and authorization tables.

Revision ID: 20260711_0001
Revises:
Create Date: 2026-07-11
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260711_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("timezone", sa.String(length=64), server_default="UTC", nullable=False),
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
            ["id"], ["auth.users.id"], ondelete="CASCADE", name="fk_profiles_id_users"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_profiles"),
    )
    op.create_table(
        "roles",
        sa.Column("id", sa.SmallInteger(), sa.Identity(), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_roles"),
        sa.UniqueConstraint("code", name="uq_roles_code"),
    )
    op.create_table(
        "profile_role_grants",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("profile_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.SmallInteger(), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("granted_by", sa.Uuid(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "revoked_at IS NULL OR revoked_at >= granted_at",
            name="chk_role_grant_revoke_time",
        ),
        sa.ForeignKeyConstraint(
            ["granted_by"],
            ["profiles.id"],
            ondelete="SET NULL",
            name="fk_profile_role_grants_granted_by_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["profiles.id"],
            ondelete="CASCADE",
            name="fk_profile_role_grants_profile_id_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["revoked_by"],
            ["profiles.id"],
            ondelete="SET NULL",
            name="fk_profile_role_grants_revoked_by_profiles",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            ondelete="RESTRICT",
            name="fk_profile_role_grants_role_id_roles",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_profile_role_grants"),
    )
    op.create_index("ix_profile_role_grants_profile_id", "profile_role_grants", ["profile_id"])
    op.create_index("ix_profile_role_grants_role_id", "profile_role_grants", ["role_id"])
    op.create_index("ix_profile_role_grants_granted_by", "profile_role_grants", ["granted_by"])
    op.create_index("ix_profile_role_grants_revoked_by", "profile_role_grants", ["revoked_by"])


def downgrade() -> None:
    op.drop_index("ix_profile_role_grants_revoked_by", table_name="profile_role_grants")
    op.drop_index("ix_profile_role_grants_granted_by", table_name="profile_role_grants")
    op.drop_index("ix_profile_role_grants_role_id", table_name="profile_role_grants")
    op.drop_index("ix_profile_role_grants_profile_id", table_name="profile_role_grants")
    op.drop_table("profile_role_grants")
    op.drop_table("roles")
    op.drop_table("profiles")
