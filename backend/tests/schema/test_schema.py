from uuid import uuid4

import pytest
from sqlalchemy import String, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from recallstack.commands.seed import DSA_CATEGORIES, seed

pytestmark = pytest.mark.integration

EXPECTED_TABLES = {
    "profiles",
    "roles",
    "profile_role_grants",
    "domains",
    "categories",
    "topics",
    "topic_categories",
    "content_items",
    "content_versions",
    "content_version_status_history",
    "content_blocks",
    "content_version_blocks",
    "content_version_categories",
    "content_version_topics",
    "content_item_categories",
    "content_item_topics",
    "content_relations",
    "practice_providers",
    "practice_resources",
    "practice_attempts",
    "user_progress",
    "bookmarks",
    "user_notes",
    "activity_events",
    "review_cards",
    "review_history",
    "catalog_releases",
    "catalog_release_versions",
    "devices",
    "device_user_sync_state",
    "device_catalog_sync_state",
    "sync_mutations",
    "user_sync_counters",
    "user_sync_change_log",
    "catalog_sync_counters",
    "catalog_sync_change_log",
}


def test_migrations_create_all_approved_tables(migrated_database_url: str) -> None:
    engine = create_engine(migrated_database_url)
    assert set(inspect(engine).get_table_names(schema="public")) >= EXPECTED_TABLES
    engine.dispose()


def test_critical_constraints_and_indexes_exist(migrated_database_url: str) -> None:
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        constraints = set(
            connection.execute(
                text(
                    "SELECT conname FROM pg_constraint c "
                    "JOIN pg_namespace n ON n.oid = c.connamespace "
                    "WHERE n.nspname = 'public'"
                )
            ).scalars()
        )
        indexes = set(
            connection.execute(
                text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
            ).scalars()
        )
    engine.dispose()
    assert {
        "fk_categories_domain_parent_category",
        "fk_content_items_current_published_version",
        "fk_content_item_categories_domain_category",
        "fk_content_item_topics_domain_topic",
        "fk_content_version_categories_domain_category",
        "fk_content_version_topics_domain_topic",
        "fk_practice_attempts_resource_item",
        "fk_review_history_card_user",
        "chk_user_progress_confidence",
        "chk_practice_attempt_duration",
        "chk_review_card_row_version",
        "chk_content_items_practice_resources_revision",
        "chk_practice_attempt_result_snapshot",
        "chk_sync_mutation_result_cursor",
    } <= constraints
    assert {
        "uq_content_item_topics_one_primary",
        "uq_content_version_topics_one_primary",
        "uq_practice_resources_one_primary",
        "ix_review_cards_due_active",
        "ix_user_notes_active_user_content",
        "ix_user_notes_deleted_user_updated",
    } <= indexes


def test_admin_practice_resource_revision_schema(migrated_database_url: str) -> None:
    engine = create_engine(migrated_database_url)
    inspector = inspect(engine)
    content_columns = {
        column["name"]: column for column in inspector.get_columns("content_items", schema="public")
    }
    resource_columns = {
        column["name"]: column
        for column in inspector.get_columns("practice_resources", schema="public")
    }
    assert content_columns["practice_resources_revision"]["nullable"] is False
    assert str(content_columns["practice_resources_revision"]["default"]) in {
        "1",
        "'1'::bigint",
    }
    external_key_type = resource_columns["external_key"]["type"]
    title_type = resource_columns["title"]["type"]
    assert isinstance(external_key_type, String)
    assert isinstance(title_type, String)
    assert external_key_type.length == 255
    assert title_type.length == 300
    engine.dispose()


async def test_development_seed_is_idempotent(migrated_database_url: str) -> None:
    await seed()
    await seed()
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        roles = connection.execute(text("SELECT code FROM roles ORDER BY code")).scalars().all()
        category_count = connection.execute(
            text(
                "SELECT count(*) FROM categories c JOIN domains d ON d.id = c.domain_id "
                "WHERE d.slug = 'dsa'"
            )
        ).scalar_one()
        providers = (
            connection.execute(
                text(
                    "SELECT slug FROM practice_providers "
                    "WHERE slug IN ('geeksforgeeks', 'leetcode') ORDER BY slug"
                )
            )
            .scalars()
            .all()
        )
    engine.dispose()
    assert roles == ["admin", "content_editor", "user"]
    assert category_count == len(DSA_CATEGORIES)
    assert providers == ["geeksforgeeks", "leetcode"]


def test_every_foreign_key_has_a_leading_column_index(migrated_database_url: str) -> None:
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        foreign_keys = connection.execute(
            text(
                "SELECT c.conname, c.conrelid, "
                "array_agg(a.attname ORDER BY keys.ordinality) AS columns "
                "FROM pg_constraint c "
                "CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS keys(attnum, ordinality) "
                "JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = keys.attnum "
                "JOIN pg_namespace n ON n.oid = c.connamespace "
                "WHERE c.contype = 'f' AND n.nspname = 'public' "
                "GROUP BY c.conname, c.conrelid"
            )
        ).all()
        indexes = connection.execute(
            text(
                "SELECT i.indrelid, array_agg(a.attname ORDER BY keys.ordinality) AS columns "
                "FROM pg_index i "
                "CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ordinality) "
                "JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = keys.attnum "
                "WHERE i.indisvalid AND keys.ordinality <= i.indnkeyatts "
                "GROUP BY i.indexrelid, i.indrelid"
            )
        ).all()
    engine.dispose()
    indexes_by_table: dict[int, list[tuple[str, ...]]] = {}
    for table_id, columns in indexes:
        indexes_by_table.setdefault(table_id, []).append(tuple(columns))
    missing = [
        name
        for name, table_id, columns in foreign_keys
        if not any(
            indexed[: len(columns)] == tuple(columns)
            for indexed in indexes_by_table.get(table_id, [])
        )
    ]
    assert not missing


def test_approved_integrity_constraints_reject_invalid_rows(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_a, domain_b = uuid4(), uuid4()
    category_a, category_b = uuid4(), uuid4()
    content_a, content_b, version_b = uuid4(), uuid4(), uuid4()
    topic_a, topic_b = uuid4(), uuid4()
    user_id = uuid4()
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:user_id)"), {"user_id": user_id}
        )
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:user_id)"), {"user_id": user_id}
        )
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:a, :sa, 'A'), (:b, :sb, 'B')"),
            {"a": domain_a, "b": domain_b, "sa": f"a-{domain_a.hex}", "sb": f"b-{domain_b.hex}"},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) VALUES "
                "(:a, :da, 'a', 'A'), (:b, :db, 'b', 'B')"
            ),
            {"a": category_a, "b": category_b, "da": domain_a, "db": domain_b},
        )
        connection.execute(
            text(
                "INSERT INTO content_items (id, domain_id, slug, type) VALUES "
                "(:a, :domain, 'a', 'problem'), (:b, :domain, 'b', 'problem')"
            ),
            {"a": content_a, "b": content_b, "domain": domain_a},
        )
        connection.execute(
            text(
                "INSERT INTO content_versions "
                "(id, content_item_id, version_number, status, title) "
                "VALUES (:id, :item, 1, 'draft', 'B')"
            ),
            {"id": version_b, "item": content_b},
        )
        connection.execute(
            text(
                "INSERT INTO topics (id, domain_id, slug, name) VALUES "
                "(:a, :domain, 'a', 'A'), (:b, :domain, 'b', 'B')"
            ),
            {"a": topic_a, "b": topic_b, "domain": domain_a},
        )
        provider_id = connection.execute(
            text("INSERT INTO practice_providers (slug, name) VALUES (:slug, 'Test') RETURNING id"),
            {"slug": f"test-{uuid4().hex}"},
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO content_item_topics "
                "(domain_id, content_item_id, topic_id, is_primary) "
                "VALUES (:domain, :item, :topic, true)"
            ),
            {"domain": domain_a, "item": content_a, "topic": topic_a},
        )
        connection.execute(
            text(
                "INSERT INTO practice_resources "
                "(content_item_id, provider_id, url, url_hash, is_primary) "
                "VALUES (:item, :provider, 'https://example.com/one', :hash, true)"
            ),
            {"item": content_a, "provider": provider_id, "hash": "a" * 64},
        )

    invalid_statements = (
        (
            "INSERT INTO content_item_categories (domain_id, content_item_id, category_id) "
            "VALUES (:domain, :item, :category)",
            {"domain": domain_a, "item": content_a, "category": category_b},
        ),
        (
            "UPDATE content_items SET current_published_version_id = :version WHERE id = :item",
            {"version": version_b, "item": content_a},
        ),
        (
            "INSERT INTO content_item_topics (domain_id, content_item_id, topic_id, is_primary) "
            "VALUES (:domain, :item, :topic, true)",
            {"domain": domain_a, "item": content_a, "topic": topic_b},
        ),
        (
            "INSERT INTO practice_resources "
            "(content_item_id, provider_id, url, url_hash, is_primary) "
            "VALUES (:item, :provider, 'https://example.com/two', :hash, true)",
            {"item": content_a, "provider": provider_id, "hash": "b" * 64},
        ),
        (
            "INSERT INTO user_progress (user_id, content_item_id, confidence) "
            "VALUES (:user, :item, 101)",
            {"user": user_id, "item": content_a},
        ),
        (
            "INSERT INTO practice_attempts "
            "(user_id, content_item_id, provider_id, outcome, duration_seconds, attempted_at) "
            "VALUES (:user, :item, :provider, 'skipped', -1, now())",
            {"user": user_id, "item": content_a, "provider": provider_id},
        ),
        (
            "INSERT INTO content_versions "
            "(content_item_id, version_number, status, title, row_version) "
            "VALUES (:item, 2, 'draft', 'Invalid', 0)",
            {"item": content_a},
        ),
    )
    for statement, parameters in invalid_statements:
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text(statement), parameters)
    engine.dispose()
