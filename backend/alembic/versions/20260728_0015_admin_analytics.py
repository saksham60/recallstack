"""Add the read-only admin analytics support tables and indexes.

Revision ID: 20260728_0015
Revises: 20260726_0014
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260728_0015"
down_revision: str | None = "20260726_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Email is an application-owned projection used only for administration. Supabase Auth
    # remains the source of truth. The conditional backfill keeps non-Supabase adapters valid.
    op.add_column("profiles", sa.Column("email", sa.String(length=320), nullable=True))
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email'
          ) THEN
            EXECUTE 'UPDATE public.profiles p SET email = lower(u.email)
                     FROM auth.users u WHERE u.id = p.id AND u.email IS NOT NULL';
            EXECUTE $ddl$
              CREATE FUNCTION public.project_profile_email_from_auth()
              RETURNS trigger
              LANGUAGE plpgsql
              SECURITY DEFINER
              SET search_path = public, auth
              AS $function$
              BEGIN
                SELECT lower(email) INTO NEW.email FROM auth.users WHERE id = NEW.id;
                RETURN NEW;
              END
              $function$
            $ddl$;
            EXECUTE 'CREATE TRIGGER trg_profiles_project_auth_email
                     BEFORE INSERT ON public.profiles
                     FOR EACH ROW EXECUTE FUNCTION public.project_profile_email_from_auth()';
          END IF;
        END $$;
        """
    )
    op.create_index(
        "ix_profiles_email_lower",
        "profiles",
        [sa.text("lower(email)")],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )

    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("admin_user_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("resource_type", sa.String(length=80), nullable=False),
        sa.Column("resource_id", sa.String(length=160), nullable=True),
        sa.Column("request_method", sa.String(length=12), nullable=False),
        sa.Column("request_path", sa.String(length=500), nullable=False),
        sa.Column("request_id", sa.String(length=128), nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["admin_user_id"],
            ["profiles.id"],
            ondelete="RESTRICT",
            name="fk_admin_audit_logs_admin_user_profiles",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_admin_audit_logs"),
    )
    op.create_index(
        "ix_admin_audit_logs_admin_created",
        "admin_audit_logs",
        ["admin_user_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_admin_audit_logs_action_created",
        "admin_audit_logs",
        ["action", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_practice_attempts_item_user_attempted",
        "practice_attempts",
        ["content_item_id", "user_id", "attempted_at"],
    )
    op.create_index(
        "ix_practice_attempts_outcome",
        "practice_attempts",
        ["outcome"],
    )


def downgrade() -> None:
    op.drop_index("ix_practice_attempts_outcome", table_name="practice_attempts")
    op.drop_index("ix_practice_attempts_item_user_attempted", table_name="practice_attempts")
    op.drop_index("ix_admin_audit_logs_action_created", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_admin_created", table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")
    op.drop_index("ix_profiles_email_lower", table_name="profiles")
    op.execute("DROP TRIGGER IF EXISTS trg_profiles_project_auth_email ON profiles")
    op.execute("DROP FUNCTION IF EXISTS project_profile_email_from_auth()")
    op.drop_column("profiles", "email")
