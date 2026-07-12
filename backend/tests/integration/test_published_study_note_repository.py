import json
from datetime import UTC, datetime
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Connection, create_engine, text

from recallstack.composition.published_study_note_uow import SqlAlchemyPublishedStudyNoteUnitOfWork
from recallstack.modules.content.application.published_study_note import PublishedStudyNoteService
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.activity_event_recorder import (
    SqlAlchemyActivityEventRecorder,
)
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.errors import AppError
from tests.conftest import TEST_PUBLISHER_PROFILE_ID

pytestmark = pytest.mark.integration


def add_content(
    connection: Connection,
    *,
    domain_id: UUID,
    category_id: UUID,
    slug: str,
    title: str,
    status: str = "published",
    archived: bool = False,
) -> tuple[UUID, UUID]:
    item_id, version_id = uuid4(), uuid4()
    connection.execute(
        text(
            "INSERT INTO content_items (id, domain_id, slug, type, difficulty, archived_at) "
            "VALUES (:id, :domain_id, :slug, 'problem', 'easy', :archived_at)"
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
            "(id, content_item_id, version_number, status, title, summary, published_at, "
            "published_by) "
            "VALUES (:id, :item_id, 2, CAST(:status AS publication_status), :title, :summary, "
            ":published_at, :published_by)"
        ),
        {
            "id": version_id,
            "item_id": item_id,
            "status": status,
            "title": title,
            "summary": f"Summary for {title}",
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
            "INSERT INTO content_item_categories "
            "(domain_id, content_item_id, category_id, sort_order) "
            "VALUES (:domain_id, :item_id, :category_id, 0)"
        ),
        {"domain_id": domain_id, "item_id": item_id, "category_id": category_id},
    )
    return item_id, version_id


async def test_published_study_note_loads_published_sections_and_records_opened_event(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_id, category_id, user_a, user_b = uuid4(), uuid4(), uuid4(), uuid4()
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, 'dsa-note', 'DSA Note')"),
            {"id": domain_id},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) "
                "VALUES (:id, :domain_id, 'arrays', 'Arrays')"
            ),
            {"id": category_id, "domain_id": domain_id},
        )
        main_id, main_version = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="two-sum-note",
            title="Two Sum",
        )
        related_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="hash-map-note",
            title="Hash Map",
        )
        prerequisite_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="arrays-note",
            title="Arrays",
        )
        add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="draft-note",
            title="Draft",
            status="draft",
        )
        add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug="archived-note",
            title="Archived",
            archived=True,
        )
        primary_topic_id, secondary_topic_id = uuid4(), uuid4()
        connection.execute(
            text(
                "INSERT INTO topics (id, domain_id, slug, name, kind) VALUES "
                "(:primary, :domain, 'arrays', 'Arrays', 'topic'), "
                "(:secondary, :domain, 'hashing', 'Hashing', 'pattern')"
            ),
            {"primary": primary_topic_id, "secondary": secondary_topic_id, "domain": domain_id},
        )
        connection.execute(
            text(
                "INSERT INTO content_item_topics "
                "(domain_id, content_item_id, topic_id, is_primary, sort_order) VALUES "
                "(:domain, :item, :primary, true, 1), (:domain, :item, :secondary, false, 0)"
            ),
            {
                "domain": domain_id,
                "item": main_id,
                "primary": primary_topic_id,
                "secondary": secondary_topic_id,
            },
        )
        first_block, second_block = uuid4(), uuid4()
        for block_id, block_type, payload, block_hash in (
            (first_block, "recognize", {"text": "Recognize complements."}, "a" * 64),
            (second_block, "code", {"asset_url": "https://cdn.example/code.py"}, "b" * 64),
        ):
            connection.execute(
                text(
                    "INSERT INTO content_blocks (id, type, payload, content_hash) "
                    "VALUES (:id, CAST(:type AS block_type), CAST(:payload AS jsonb), :hash)"
                ),
                {
                    "id": block_id,
                    "type": block_type,
                    "payload": json.dumps(payload),
                    "hash": block_hash,
                },
            )
        connection.execute(
            text(
                "INSERT INTO content_version_blocks "
                "(content_version_id, content_block_id, position, heading) VALUES "
                "(:version, :second, 2, 'Code'), (:version, :first, 1, 'Recognize')"
            ),
            {"version": main_version, "first": first_block, "second": second_block},
        )
        source_id, target_id = sorted((main_id, related_id))
        connection.execute(
            text(
                "INSERT INTO content_relations "
                "(source_content_item_id, target_content_item_id, relation_type, sort_order) "
                "VALUES (:source, :target, 'related', 2), (:main, :prerequisite, 'prerequisite', 1)"
            ),
            {
                "source": source_id,
                "target": target_id,
                "main": main_id,
                "prerequisite": prerequisite_id,
            },
        )
        provider_id = connection.execute(
            text(
                "INSERT INTO practice_providers (slug, name) VALUES ('leetcode', 'LeetCode') "
                "ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id"
            )
        ).scalar_one()
        resource_id = uuid4()
        connection.execute(
            text(
                "INSERT INTO practice_resources "
                "(id, content_item_id, provider_id, external_key, url, url_hash, title, "
                "is_primary) "
                "VALUES (:id, :item, :provider, '1', :url, :hash, 'Two Sum', true)"
            ),
            {
                "id": resource_id,
                "item": main_id,
                "provider": provider_id,
                "url": "https://leetcode.com/problems/two-sum",
                "hash": "c" * 64,
            },
        )
        connection.execute(
            text(
                "INSERT INTO user_progress "
                "(user_id, content_item_id, status, confidence, last_opened_at) VALUES "
                "(:a, :item, 'learning', 65, now()), (:b, :item, 'mastered', 100, now())"
            ),
            {"a": user_a, "b": user_b, "item": main_id},
        )
        connection.execute(
            text("INSERT INTO bookmarks (user_id, content_item_id) VALUES (:user_id, :item_id)"),
            {"user_id": user_a, "item_id": main_id},
        )
        connection.execute(
            text(
                "INSERT INTO review_cards (id, user_id, content_item_id, due_at, review_count) "
                "VALUES (:id, :user, :item, now() + interval '1 day', 3)"
            ),
            {"id": uuid4(), "user": user_a, "item": main_id},
        )
    engine.dispose()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = PublishedStudyNoteService(
        lambda: SqlAlchemyPublishedStudyNoteUnitOfWork(database.session_factory),
        SqlAlchemyActivityEventRecorder(database.session_factory),
    )
    with patch("recallstack.shared.database.connection.logger.info") as log_info:
        result = await service.query(slug="two-sum-note", profile_id=user_a)

    assert result.content_item_id == main_id
    assert result.published_version_number == 2
    assert [block.position for block in result.blocks] == [1, 2]
    assert result.blocks[1].payload["asset_url"] == "https://cdn.example/code.py"
    assert result.primary_topic is not None
    assert result.primary_topic.id == primary_topic_id
    assert [item.content_item_id for item in result.related_content] == [related_id]
    assert [item.content_item_id for item in result.prerequisites] == [prerequisite_id]
    assert result.practice_resources[0].id == resource_id
    assert result.user_progress.status is LearningStatus.LEARNING
    assert result.user_progress.confidence == 65
    assert result.is_bookmarked is True
    assert result.review_card is not None
    assert result.review_card.review_count == 3
    assert (
        len(
            [call for call in log_info.call_args_list if call.args[0] == "database_query_completed"]
        )
        == 8
    )

    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        events = connection.execute(
            text(
                "SELECT event_type, user_id, content_item_id, "
                "metadata->>'published_version_number' "
                "FROM activity_events WHERE content_item_id = :item"
            ),
            {"item": main_id},
        ).all()
    engine.dispose()
    assert events == [("content_opened", user_a, main_id, "2")]

    for unpublished_slug in ("draft-note", "archived-note"):
        with pytest.raises(AppError) as error:
            await service.query(slug=unpublished_slug, profile_id=user_a)
        assert error.value.status == 404
    await database.close()
