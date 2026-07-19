import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from alembic import command
from recallstack.shared.config import get_settings

pytestmark = pytest.mark.integration


def test_upgrade_from_previous_head_preserves_and_backfills_data(postgres_url: str) -> None:
    admin_url = make_url(postgres_url.replace("postgresql+psycopg2://", "postgresql+psycopg://"))
    database_name = f"recallstack_upgrade_{uuid4().hex}"
    admin_engine = create_engine(admin_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{database_name}"'))
    upgrade_url = admin_url.set(database=database_name).render_as_string(hide_password=False)
    engine = create_engine(upgrade_url)
    old_url = os.environ.get("DATABASE_URL")
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE SCHEMA auth"))
            connection.execute(text("CREATE TABLE auth.users (id uuid PRIMARY KEY)"))
        os.environ["DATABASE_URL"] = upgrade_url
        get_settings.cache_clear()
        config = Config("alembic.ini")
        command.upgrade(config, "20260717_0011")

        actor, domain, category, topic, item, version = (uuid4() for _ in range(6))
        attempt_event, attempt_id, card_id = uuid4(), uuid4(), uuid4()
        now = datetime.now(UTC)
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": actor})
            connection.execute(text("INSERT INTO profiles (id) VALUES (:id)"), {"id": actor})
            connection.execute(
                text("INSERT INTO domains (id, slug, name) VALUES (:id, 'upgrade', 'Upgrade')"),
                {"id": domain},
            )
            connection.execute(
                text(
                    "INSERT INTO categories (id, domain_id, slug, name) "
                    "VALUES (:id, :domain, 'arrays', 'Arrays')"
                ),
                {"id": category, "domain": domain},
            )
            connection.execute(
                text(
                    "INSERT INTO topics (id, domain_id, slug, name) "
                    "VALUES (:id, :domain, 'search', 'Search')"
                ),
                {"id": topic, "domain": domain},
            )
            connection.execute(
                text(
                    "INSERT INTO content_items (id, domain_id, slug, type) "
                    "VALUES (:id, :domain, 'upgrade-item', 'problem')"
                ),
                {"id": item, "domain": domain},
            )
            connection.execute(
                text(
                    "INSERT INTO content_versions "
                    "(id, content_item_id, version_number, status, title, published_at, "
                    "published_by) VALUES "
                    "(:id, :item, 1, 'published', 'Upgrade item', :now, :actor)"
                ),
                {"id": version, "item": item, "now": now, "actor": actor},
            )
            connection.execute(
                text(
                    "UPDATE content_items SET current_published_version_id = :version "
                    "WHERE id = :item"
                ),
                {"version": version, "item": item},
            )
            connection.execute(
                text(
                    "INSERT INTO content_item_categories "
                    "(domain_id, content_item_id, category_id) VALUES (:domain, :item, :category)"
                ),
                {"domain": domain, "item": item, "category": category},
            )
            connection.execute(
                text(
                    "INSERT INTO content_item_topics "
                    "(domain_id, content_item_id, topic_id, is_primary) "
                    "VALUES (:domain, :item, :topic, true)"
                ),
                {"domain": domain, "item": item, "topic": topic},
            )
            provider_id = connection.execute(
                text(
                    "INSERT INTO practice_providers (slug, name) "
                    "VALUES ('upgrade-provider', 'Upgrade provider') RETURNING id"
                )
            ).scalar_one()
            connection.execute(
                text(
                    "INSERT INTO user_progress "
                    "(user_id, content_item_id, status, confidence) "
                    "VALUES (:actor, :item, 'confident', 77)"
                ),
                {"actor": actor, "item": item},
            )
            connection.execute(
                text(
                    "INSERT INTO review_cards "
                    "(id, user_id, content_item_id, due_at) VALUES (:id, :actor, :item, :now)"
                ),
                {"id": card_id, "actor": actor, "item": item, "now": now},
            )
            connection.execute(
                text(
                    "INSERT INTO practice_attempts "
                    "(id, attempt_event_id, user_id, content_item_id, provider_id, outcome, "
                    "hint_used, attempted_at) VALUES "
                    "(:id, :event, :actor, :item, :provider, 'solved_independently', false, :now)"
                ),
                {
                    "id": attempt_id,
                    "event": attempt_event,
                    "actor": actor,
                    "item": item,
                    "provider": provider_id,
                    "now": now,
                },
            )

        command.upgrade(config, "head")
        with engine.connect() as connection:
            version_category = connection.execute(
                text(
                    "SELECT category_id FROM content_version_categories "
                    "WHERE content_version_id = :version"
                ),
                {"version": version},
            ).scalar_one()
            version_topic = connection.execute(
                text(
                    "SELECT topic_id FROM content_version_topics "
                    "WHERE content_version_id = :version AND is_primary"
                ),
                {"version": version},
            ).scalar_one()
            snapshot = connection.execute(
                text(
                    "SELECT result_progress, result_confidence, result_review_card_id, "
                    "result_next_review_at FROM practice_attempts WHERE id = :id"
                ),
                {"id": attempt_id},
            ).one()
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
        assert version_category == category
        assert version_topic == topic
        assert tuple(snapshot) == ("confident", 77, card_id, now)
        assert revision == "20260719_0013"
    finally:
        engine.dispose()
        if old_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = old_url
        get_settings.cache_clear()
        with admin_engine.connect() as connection:
            connection.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :name"
                ),
                {"name": database_name},
            )
            connection.execute(text(f'DROP DATABASE IF EXISTS "{database_name}"'))
        admin_engine.dispose()
