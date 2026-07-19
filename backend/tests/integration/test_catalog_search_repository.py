import json
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text

from recallstack.composition.search_uow import SqlAlchemySearchUnitOfWork
from recallstack.modules.catalog.application.search import SearchFilters, SearchService
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from tests.integration.test_published_study_note_repository import add_content

pytestmark = pytest.mark.integration


def filters(**overrides: object) -> SearchFilters:
    values: dict[str, object] = {
        "q": "",
        "domain": None,
        "category": None,
        "topic": None,
        "content_type": None,
        "difficulty": None,
        "page": 1,
        "page_size": 25,
    }
    values.update(overrides)
    return SearchFilters(**values)  # type: ignore[arg-type]


async def test_postgresql_search_ranking_filters_and_private_progress(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_id, category_a, category_b, topic_a, user_a, user_b = (uuid4() for _ in range(6))
    domain_slug = f"search-{domain_id.hex[:8]}"
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Search')"),
            {"id": domain_id, "slug": domain_slug},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) VALUES "
                "(:a, :domain, 'algorithms', 'Algorithms'), "
                "(:b, :domain, 'other', 'Other')"
            ),
            {"a": category_a, "b": category_b, "domain": domain_id},
        )
        connection.execute(
            text(
                "INSERT INTO topics (id, domain_id, slug, name) "
                "VALUES (:id, :domain, 'binary-search', 'Binary Search')"
            ),
            {"id": topic_a, "domain": domain_id},
        )
        exact_id, exact_version = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_a,
            slug="binary-search-exact",
            title="Binary Search",
        )
        body_id, body_version = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_b,
            slug="search-body-match",
            title="Ordered Lookup Guide",
        )
        archived_id, archived_version = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_a,
            slug="archived-search",
            title="Binary Search Archived",
            archived=True,
        )
        draft_id, draft_version = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_a,
            slug="draft-search",
            title="Binary Search Draft",
            status="draft",
        )
        del archived_id, draft_id
        connection.execute(
            text(
                "INSERT INTO content_version_topics "
                "(content_version_id, content_item_id, domain_id, topic_id, is_primary) "
                "VALUES (:version, :item, :domain, :topic, true)"
            ),
            {
                "version": exact_version,
                "item": exact_id,
                "domain": domain_id,
                "topic": topic_a,
            },
        )
        for version_id, text_value, block_hash in (
            (exact_version, "Find a target in sorted input.", "1" * 64),
            (body_version, "Binary search appears only in this explanatory body.", "2" * 64),
            (archived_version, "Binary search archived body.", "3" * 64),
            (draft_version, "Binary search draft body.", "4" * 64),
        ):
            block_id = uuid4()
            connection.execute(
                text(
                    "INSERT INTO content_blocks (id, type, payload, plain_text, content_hash) "
                    "VALUES (:id, 'recognize', CAST(:payload AS jsonb), :plain_text, :hash)"
                ),
                {
                    "id": block_id,
                    "payload": json.dumps({"text": text_value}),
                    "plain_text": text_value,
                    "hash": block_hash,
                },
            )
            connection.execute(
                text(
                    "INSERT INTO content_version_blocks "
                    "(content_version_id, content_block_id, position) VALUES (:version, :block, 0)"
                ),
                {"version": version_id, "block": block_id},
            )
            connection.execute(
                text("SELECT refresh_content_version_search_document(:version)"),
                {"version": version_id},
            )
        connection.execute(
            text("UPDATE content_versions SET summary = :summary WHERE id = :version"),
            {"version": exact_version, "summary": "S" * 300},
        )
        connection.execute(
            text(
                "INSERT INTO user_progress (user_id, content_item_id, status, confidence) "
                "VALUES (:a, :item, 'confident', 80), (:b, :item, 'mastered', 100)"
            ),
            {"a": user_a, "b": user_b, "item": exact_id},
        )
    engine.dispose()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    search = SearchService(lambda: SqlAlchemySearchUnitOfWork(database.session_factory))
    try:
        exact = await search.query(profile_id=user_a, filters=filters(q="Binary Search"))
        assert [item.content_item_id for item in exact.items[:2]] == [exact_id, body_id]
        assert exact.items[0].rank > exact.items[1].rank
        assert exact.items[0].summary_excerpt is not None
        assert len(exact.items[0].summary_excerpt) == 240
        assert exact.items[0].progress_status is LearningStatus.CONFIDENT
        assert exact.items[0].progress_confidence == 80

        typo = await search.query(profile_id=user_a, filters=filters(q="Binry Search"))
        assert typo.items[0].content_item_id == exact_id
        assert typo.items[0].rank > 0
        partial = await search.query(profile_id=user_a, filters=filters(q="Binary"))
        assert partial.items[0].content_item_id == exact_id

        scoped = await search.query(
            profile_id=user_a,
            filters=filters(
                domain=domain_slug, category="algorithms", topic="binary-search", page_size=1
            ),
        )
        assert scoped.total_items == 1
        assert scoped.items[0].matched_category == "Algorithms"
        assert scoped.items[0].matched_topic == "Binary Search"
        other_user = await search.query(profile_id=user_b, filters=filters(q="Binary Search"))
        assert other_user.items[0].progress_status is LearningStatus.MASTERED
        assert other_user.items[0].progress_confidence == 100
        assert {item.slug for item in exact.items}.isdisjoint({"archived-search", "draft-search"})

        page_one = await search.query(profile_id=user_a, filters=filters(page=1, page_size=1))
        page_two = await search.query(profile_id=user_a, filters=filters(page=2, page_size=1))
        assert page_one.items[0].content_item_id != page_two.items[0].content_item_id
    finally:
        await database.close()
