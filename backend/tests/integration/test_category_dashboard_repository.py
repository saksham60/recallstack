from datetime import UTC, datetime
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Connection, create_engine, text

from recallstack.composition.category_dashboard_uow import SqlAlchemyCategoryDashboardUnitOfWork
from recallstack.modules.catalog.application.category_dashboard import CategoryDashboardService
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from tests.conftest import TEST_PUBLISHER_PROFILE_ID

pytestmark = pytest.mark.integration


def add_content(
    connection: Connection,
    *,
    domain_id: UUID,
    category_id: UUID,
    slug: str,
    status: str,
    archived: bool = False,
) -> UUID:
    item_id, version_id = uuid4(), uuid4()
    connection.execute(
        text(
            "INSERT INTO content_items "
            "(id, domain_id, slug, type, archived_at) "
            "VALUES (:id, :domain_id, :slug, 'problem', :archived_at)"
        ),
        {
            "id": item_id,
            "domain_id": domain_id,
            "slug": slug,
            "archived_at": datetime.now(UTC) if archived else None,
        },
    )
    connection.execute(
        text(
            "INSERT INTO content_versions "
            "(id, content_item_id, version_number, status, title, published_at, published_by) "
            "VALUES (:id, :item_id, 1, CAST(:status AS publication_status), :title, "
            ":published_at, :published_by)"
        ),
        {
            "id": version_id,
            "item_id": item_id,
            "status": status,
            "title": slug,
            "published_at": datetime.now(UTC) if status == "published" else None,
            "published_by": TEST_PUBLISHER_PROFILE_ID if status == "published" else None,
        },
    )
    connection.execute(
        text("UPDATE content_items SET current_published_version_id = :version WHERE id = :id"),
        {"version": version_id, "id": item_id},
    )
    connection.execute(
        text(
            "INSERT INTO content_item_categories (domain_id, content_item_id, category_id) "
            "VALUES (:domain_id, :item_id, :category_id)"
        ),
        {"domain_id": domain_id, "item_id": item_id, "category_id": category_id},
    )
    connection.execute(
        text(
            "INSERT INTO content_version_categories "
            "(content_version_id, content_item_id, domain_id, category_id) "
            "VALUES (:version_id, :item_id, :domain_id, :category_id)"
        ),
        {
            "version_id": version_id,
            "domain_id": domain_id,
            "item_id": item_id,
            "category_id": category_id,
        },
    )
    return item_id


async def test_dashboard_filters_content_scopes_user_and_uses_fixed_query_count(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_id = uuid4()
    populated_category, empty_category, inactive_category = uuid4(), uuid4(), uuid4()
    user_a, user_b = uuid4(), uuid4()
    domain_slug = f"dashboard-{domain_id.hex[:8]}"
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:a), (:b)"),
            {"a": user_a, "b": user_b},
        )
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:a), (:b)"),
            {"a": user_a, "b": user_b},
        )
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Dashboard Test')"),
            {"id": domain_id, "slug": domain_slug},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name, sort_order, is_active) VALUES "
                "(:populated, :domain, 'populated', 'Populated', 1, true), "
                "(:empty, :domain, 'empty', 'Empty', 0, true), "
                "(:inactive, :domain, 'inactive', 'Inactive', 2, false)"
            ),
            {
                "populated": populated_category,
                "empty": empty_category,
                "inactive": inactive_category,
                "domain": domain_id,
            },
        )
        published_a = add_content(
            connection,
            domain_id=domain_id,
            category_id=populated_category,
            slug=f"published-a-{uuid4().hex[:6]}",
            status="published",
        )
        published_b = add_content(
            connection,
            domain_id=domain_id,
            category_id=populated_category,
            slug=f"published-b-{uuid4().hex[:6]}",
            status="published",
        )
        add_content(
            connection,
            domain_id=domain_id,
            category_id=populated_category,
            slug=f"archived-{uuid4().hex[:6]}",
            status="published",
            archived=True,
        )
        add_content(
            connection,
            domain_id=domain_id,
            category_id=populated_category,
            slug=f"draft-{uuid4().hex[:6]}",
            status="draft",
        )
        connection.execute(
            text(
                "INSERT INTO user_progress (user_id, content_item_id, status) VALUES "
                "(:a, :published_a, 'learning'), (:b, :published_b, 'mastered')"
            ),
            {"a": user_a, "b": user_b, "published_a": published_a, "published_b": published_b},
        )
    engine.dispose()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = CategoryDashboardService(
        lambda: SqlAlchemyCategoryDashboardUnitOfWork(database.session_factory)
    )
    with patch("recallstack.shared.database.connection.logger.info") as log_info:
        result = await service.query(domain_slug=domain_slug, profile_id=user_a)

    assert [item.slug for item in result] == ["empty", "populated"]
    assert result[0].total_content_items == 0
    assert result[1].total_content_items == 2
    assert result[1].learning_count == 1
    assert result[1].mastered_count == 0
    assert result[1].not_started_count == 1
    assert result[1].progress_percentage == 50.0
    query_records = [
        call for call in log_info.call_args_list if call.args[0] == "database_query_completed"
    ]
    assert len(query_records) == 3
    await database.close()
