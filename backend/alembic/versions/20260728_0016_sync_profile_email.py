"""Synchronize profile email changes from Supabase Auth.

Revision ID: 20260728_0016
Revises: 20260728_0015
Create Date: 2026-07-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260728_0016"
down_revision: str | None = "20260728_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The Auth schema is provider-owned and is absent in supported non-Supabase adapters.
    # Dynamic DDL prevents PostgreSQL from resolving auth.users unless its email column exists.
    op.execute(
        """
        DO $migration$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'auth'
              AND table_name = 'users'
              AND column_name = 'email'
          ) THEN
            EXECUTE $function$
              CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
              RETURNS trigger
              LANGUAGE plpgsql
              SECURITY DEFINER
              SET search_path = pg_catalog, public
              AS $body$
              BEGIN
                UPDATE public.profiles
                SET email = lower(NEW.email)
                WHERE id = NEW.id;
                RETURN NEW;
              END
              $body$
            $function$;
            EXECUTE 'DROP TRIGGER IF EXISTS trg_auth_users_sync_profile_email ON auth.users';
            EXECUTE $trigger$
              CREATE TRIGGER trg_auth_users_sync_profile_email
              AFTER UPDATE OF email ON auth.users
              FOR EACH ROW
              WHEN (OLD.email IS DISTINCT FROM NEW.email)
              EXECUTE FUNCTION public.sync_profile_email_from_auth()
            $trigger$;
          END IF;
        END
        $migration$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $migration$
        BEGIN
          IF to_regclass('auth.users') IS NOT NULL THEN
            EXECUTE 'DROP TRIGGER IF EXISTS trg_auth_users_sync_profile_email ON auth.users';
          END IF;
        END
        $migration$;
        """
    )
    op.execute("DROP FUNCTION IF EXISTS public.sync_profile_email_from_auth()")
