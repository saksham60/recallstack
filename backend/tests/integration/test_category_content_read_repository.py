from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Connection, create_engine, text

from recallstack.composition.category_content_list_uow import (
    SqlAlchemyCategoryContentReadUnitOfWork,
)
from recallstack.modules.content.application.category_content_list import (
    CategoryContentListFilters,
    CategoryContentListService,
)
from recallstack.modules.learning.domain.enums import LearningStatus
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
    title: str,
    difficulty: str,
    category_sort_order: int,
    status: str = "published",
    archived: bool = False,
) -> UUID:
    item_id, version_id = uuid4(), uuid4()
    published_at = datetime.now(UTC) if status == "published" else None
    connection.execute(
        text(
            "INSERT INTO content_items "
            "(id, domain_id, slug, type, difficulty, archived_at, updated_at) "
            "VALUES (:id, :domain_id, :slug, 'problem', CAST(:difficulty AS difficulty_level), "
            ":archived_at, :updated_at)"
        ),
        {
            "id": item_id,
            "domain_id": domain_id,
            "slug": slug,
            "difficulty": difficulty,
            "archived_at": datetime.now(UTC) if archived else None,
            "updated_at": datetime.now(UTC) + timedelta(seconds=category_sort_order),
        },
    )
    connection.execute(
        text(
            "INSERT INTO content_versions "
            "(id, content_item_id, version_number, status, title, summary, published_at, "
            "published_by) "
            "VALUES (:id, :item_id, 1, CAST(:status AS publication_status), :title, :summary, "
            ":published_at, :published_by)"
        ),
        {
            "id": version_id,
            "item_id": item_id,
            "status": status,
            "title": title,
            "summary": f"Summary for {title}",
            "published_at": published_at,
            "published_by": TEST_PUBLISHER_PROFILE_ID if status == "published" else None,
        },
    )
    connection.execute(
        text("UPDATE content_items SET current_published_version_id = :version WHERE id = :id"),
        {"version": version_id, "id": item_id},
    )
    connection.execute(
        text(
            "INSERT INTO content_item_categories "
            "(domain_id, content_item_id, category_id, sort_order) "
            "VALUES (:domain_id, :item_id, :category_id, :sort_order)"
        ),
        {
            "domain_id": domain_id,
            "item_id": item_id,
            "category_id": category_id,
            "sort_order": category_sort_order,
        },
    )
    return item_id


def filters(**overrides: object) -> CategoryContentListFilters:
    values: dict[str, object] = {
        "content_type": None,
        "difficulty": None,
        "status": None,
        "topic_slug": None,
        "search": None,
        "page": 1,
        "page_size": 25,
        "sort": "sort_order",
    }
    values.update(overrides)
    return CategoryContentListFilters(**values)  # type: ignore[arg-type]


async def test_category_content_read_model_filters_and_scopes_user_state(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_id, category_id, user_a, user_b = uuid4(), uuid4(), uuid4(), uuid4()
    domain_slug = f"content-list-{domain_id.hex[:8]}"
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Content List')"),
            {"id": domain_id, "slug": domain_slug},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name, is_active) "
                "VALUES (:id, :domain_id, 'arrays', 'Arrays', true)"
            ),
            {"id": category_id, "domain_id": domain_id},
        )
        alpha = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="two-sum",
            title="Alpha Two Sum",
            difficulty="easy",
            category_sort_order=2,
        )
        beta = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="contains-duplicate",
            title="Beta Contains Duplicate",
            difficulty="medium",
            category_sort_order=1,
        )
        gamma = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="three-sum",
            title="Gamma Three Sum",
            difficulty="hard",
            category_sort_order=3,
        )
        add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="draft",
            title="Draft Content",
            difficulty="easy",
            category_sort_order=4,
            status="draft",
        )
        add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="archived",
            title="Archived Content",
            difficulty="easy",
            category_sort_order=5,
            archived=True,
        )
        topic_id = uuid4()
        connection.execute(
            text(
                "INSERT INTO topics (id, domain_id, slug, name) "
                "VALUES (:id, :domain_id, 'arrays', 'Arrays')"
            ),
            {"id": topic_id, "domain_id": domain_id},
        )
        connection.execute(
            text(
                "INSERT INTO content_item_topics "
                "(domain_id, content_item_id, topic_id, is_primary) "
                "VALUES (:domain_id, :item_id, :topic_id, true)"
            ),
            {"domain_id": domain_id, "item_id": alpha, "topic_id": topic_id},
        )
        provider_id = connection.execute(
            text(
                "INSERT INTO practice_providers (slug, name) "
                "VALUES ('leetcode', 'LeetCode') "
                "ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id"
            )
        ).scalar_one()
        resource_id = uuid4()
        connection.execute(
            text(
                "INSERT INTO practice_resources "
                "(id, content_item_id, provider_id, url, url_hash, title, is_primary) "
                "VALUES (:id, :item_id, :provider_id, :url, :url_hash, 'Two Sum', true)"
            ),
            {
                "id": resource_id,
                "item_id": alpha,
                "provider_id": provider_id,
                "url": "https://leetcode.com/problems/two-sum",
                "url_hash": "a" * 64,
            },
        )
        connection.execute(
            text(
                "INSERT INTO user_progress "
                "(user_id, content_item_id, status, confidence, last_opened_at) "
                "VALUES (:a, :alpha, 'learning', 70, now()), (:a, :gamma, 'mastered', 95, now()), "
                "(:b, :beta, 'mastered', 100, now())"
            ),
            {"a": user_a, "b": user_b, "alpha": alpha, "beta": beta, "gamma": gamma},
        )
        connection.execute(
            text("INSERT INTO bookmarks (user_id, content_item_id) VALUES (:id, :item_id)"),
            {"id": user_a, "item_id": alpha},
        )
        connection.execute(
            text(
                "INSERT INTO review_cards (id, user_id, content_item_id, due_at) "
                "VALUES (:id, :user_id, :item_id, now() + interval '1 day')"
            ),
            {"id": uuid4(), "user_id": user_a, "item_id": alpha},
        )
    engine.dispose()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = CategoryContentListService(
        lambda: SqlAlchemyCategoryContentReadUnitOfWork(database.session_factory)
    )
    with patch("recallstack.shared.database.connection.logger.info") as log_info:
        first_page = await service.query(
            category_id=category_id,
            profile_id=user_a,
            filters=filters(page_size=2, sort="title"),
        )
    assert [item.title for item in first_page.items] == ["Alpha Two Sum", "Beta Contains Duplicate"]
    assert first_page.total_items == 3
    assert first_page.total_pages == 2
    assert first_page.items[0].primary_topic is not None
    assert first_page.items[0].primary_topic.slug == "arrays"
    assert first_page.items[0].primary_practice_resource is not None
    assert first_page.items[0].primary_practice_resource.id == resource_id
    assert first_page.items[0].is_bookmarked is True
    assert first_page.items[0].next_review_at is not None
    assert first_page.items[1].user_progress.status is LearningStatus.NEW
    assert first_page.items[1].user_progress.confidence == 0

    filtered = await service.query(
        category_id=category_id,
        profile_id=user_a,
        filters=filters(
            content_type="problem",
            difficulty="easy",
            status=LearningStatus.LEARNING,
            topic_slug="arrays",
            search="two sum",
        ),
    )
    assert [item.content_item_id for item in filtered.items] == [alpha]
    assert (
        len(
            [call for call in log_info.call_args_list if call.args[0] == "database_query_completed"]
        )
        == 3
    )
    await database.close()
