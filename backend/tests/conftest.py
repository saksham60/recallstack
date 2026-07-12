import os
from collections.abc import Iterator
from uuid import UUID

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, text
from testcontainers.postgres import PostgresContainer

from alembic import command
from recallstack.shared.config import get_settings
from recallstack.shared.database.event_loop import configure_psycopg_event_loop

TEST_PUBLISHER_PROFILE_ID = UUID("00000000-0000-0000-0000-000000000001")


def pytest_configure() -> None:
    configure_psycopg_event_loop()


@pytest.fixture(scope="session")
def postgres_url() -> Iterator[str]:
    if os.getenv("RUN_INTEGRATION_TESTS") != "1":
        pytest.skip("set RUN_INTEGRATION_TESTS=1 to run PostgreSQL integration tests")
    supplied_url = os.getenv("TEST_DATABASE_URL")
    if supplied_url:
        yield supplied_url
        return
    with PostgresContainer("postgres:17.6-bookworm", driver="psycopg") as postgres:
        yield postgres.get_connection_url()


@pytest.fixture(scope="session")
def migrated_database_url(postgres_url: str) -> Iterator[str]:
    sync_url = postgres_url.replace("postgresql+psycopg2://", "postgresql+psycopg://")
    subject = TEST_PUBLISHER_PROFILE_ID
    engine = create_engine(sync_url)
    with engine.begin() as connection:
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS auth"))
        connection.execute(text("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)"))
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:id) ON CONFLICT DO NOTHING"),
            {"id": subject},
        )
    old_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = sync_url
    get_settings.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:id) ON CONFLICT DO NOTHING"),
            {"id": subject},
        )
        connection.execute(
            text("INSERT INTO roles (code) VALUES ('admin') ON CONFLICT (code) DO NOTHING")
        )
        connection.execute(
            text(
                "INSERT INTO profile_role_grants (profile_id, role_id) "
                "SELECT :id, id FROM roles WHERE code = 'admin' AND NOT EXISTS ("
                "SELECT 1 FROM profile_role_grants g WHERE g.profile_id = :id "
                "AND g.role_id = roles.id AND g.revoked_at IS NULL)"
            ),
            {"id": subject},
        )
    yield sync_url
    if old_url is None:
        os.environ.pop("DATABASE_URL", None)
    else:
        os.environ["DATABASE_URL"] = old_url
    get_settings.cache_clear()
    engine.dispose()
