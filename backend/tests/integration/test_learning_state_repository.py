from typing import Self
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text

from recallstack.composition.learning_uow import SqlAlchemyLearningUnitOfWork
from recallstack.composition.sync_uow import SqlAlchemySyncUnitOfWork
from recallstack.modules.learning.application.learning_state import LearningService
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.learning_state_repository import (
    SqlAlchemyLearningStateRepository,
)
from recallstack.modules.sync.application.sync_service import SyncService
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.errors import AppError
from tests.integration.test_published_study_note_repository import add_content

pytestmark = pytest.mark.integration


class _FailingAfterUserChangeRepository(SqlAlchemyLearningStateRepository):
    async def _record_user_change(self, **kwargs: object) -> int:
        await super()._record_user_change(**kwargs)  # type: ignore[arg-type]
        raise RuntimeError("simulated user change failure")


class _FailingLearningUnitOfWork(SqlAlchemyLearningUnitOfWork):
    async def __aenter__(self) -> Self:
        await super().__aenter__()
        assert self._session is not None
        self.repository = _FailingAfterUserChangeRepository(self._session)
        return self


async def test_learning_state_is_private_idempotent_and_concurrency_safe(
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
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Learning')"),
            {"id": domain_id, "slug": f"learning-{domain_id.hex[:8]}"},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) "
                "VALUES (:id, :domain_id, 'arrays', 'Arrays')"
            ),
            {"id": category_id, "domain_id": domain_id},
        )
        content_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"learning-content-{uuid4().hex[:8]}",
            title="Learning Content",
        )
        draft_content_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"draft-learning-{uuid4().hex[:8]}",
            title="Draft Learning Content",
            status="draft",
        )
    engine.dispose()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = LearningService(lambda: SqlAlchemyLearningUnitOfWork(database.session_factory))
    sync = SyncService(
        lambda: SqlAlchemySyncUnitOfWork(database.session_factory),
        retention_days=30,
    )
    device = await sync.register_device(
        profile_id=user_a,
        device_name="Learning integration",
        platform="web",
        app_version="1",
    )

    with pytest.raises(AppError) as unpublished_progress:
        await service.save_progress(
            profile_id=user_a,
            content_item_id=draft_content_id,
            status=LearningStatus.LEARNING,
            confidence=10,
            expected_row_version=0,
        )
    assert unpublished_progress.value.status == 404
    with pytest.raises(AppError):
        await service.add_bookmark(profile_id=user_a, content_item_id=draft_content_id)
    with pytest.raises(AppError):
        await service.create_note(
            profile_id=user_a,
            content_item_id=draft_content_id,
            kind="note",
            title=None,
            body="Must not attach to a draft",
        )

    empty_progress = await service.get_progress(profile_id=user_a, content_item_id=content_id)
    assert empty_progress.status is LearningStatus.NEW
    assert empty_progress.row_version == 0

    progress = await service.save_progress(
        profile_id=user_a,
        content_item_id=content_id,
        status=LearningStatus.LEARNING,
        confidence=40,
        expected_row_version=0,
    )
    assert progress.row_version == 1
    assert progress.status is LearningStatus.LEARNING
    assert progress.sync_cursor == 1
    with pytest.raises(AppError) as stale_progress:
        await service.save_progress(
            profile_id=user_a,
            content_item_id=content_id,
            status=LearningStatus.ATTEMPTED,
            confidence=50,
            expected_row_version=0,
        )
    assert stale_progress.value.status == 409
    with pytest.raises(AppError) as invalid_transition:
        await service.save_progress(
            profile_id=user_a,
            content_item_id=content_id,
            status=LearningStatus.MASTERED,
            confidence=100,
            expected_row_version=1,
        )
    assert invalid_transition.value.status == 422
    updated_progress = await service.save_progress(
        profile_id=user_a,
        content_item_id=content_id,
        status=LearningStatus.ATTEMPTED,
        confidence=55,
        expected_row_version=1,
    )
    assert updated_progress.row_version == 2
    assert updated_progress.sync_cursor == 2

    bookmark_added = await service.add_bookmark(profile_id=user_a, content_item_id=content_id)
    bookmark_duplicate = await service.add_bookmark(profile_id=user_a, content_item_id=content_id)
    assert bookmark_added.changed is True and bookmark_added.sync_cursor == 3
    assert bookmark_duplicate.changed is False and bookmark_duplicate.sync_cursor is None
    bookmarks = await service.list_bookmarks(profile_id=user_a, page=1, page_size=10)
    assert bookmarks.total_items == 1
    assert bookmarks.items[0].content_item_id == content_id
    bookmark_removed = await service.remove_bookmark(profile_id=user_a, content_item_id=content_id)
    bookmark_missing = await service.remove_bookmark(profile_id=user_a, content_item_id=content_id)
    assert bookmark_removed.changed is True and bookmark_removed.sync_cursor == 4
    assert bookmark_missing.changed is False and bookmark_missing.sync_cursor is None
    assert (await service.list_bookmarks(profile_id=user_a, page=1, page_size=10)).total_items == 0

    note = await service.create_note(
        profile_id=user_a,
        content_item_id=content_id,
        kind="note",
        title="First note",
        body="Remember complements.",
    )
    assert note.sync_cursor == 5
    updated_note = await service.update_note(
        profile_id=user_a,
        note_id=note.id,
        kind=None,
        title=None,
        title_is_set=True,
        body="Updated body.",
        expected_row_version=note.row_version,
    )
    assert updated_note.title is None
    assert updated_note.row_version == note.row_version + 1
    assert updated_note.sync_cursor == 6
    with pytest.raises(AppError) as stale_note:
        await service.update_note(
            profile_id=user_a,
            note_id=note.id,
            kind=None,
            title=None,
            title_is_set=False,
            body="Stale body.",
            expected_row_version=note.row_version,
        )
    assert stale_note.value.status == 409
    with pytest.raises(AppError) as guessed_note:
        await service.update_note(
            profile_id=user_b,
            note_id=note.id,
            kind=None,
            title=None,
            title_is_set=False,
            body="Not allowed.",
            expected_row_version=updated_note.row_version,
        )
    assert guessed_note.value.status == 404

    for index in range(3):
        await service.create_note(
            profile_id=user_a,
            content_item_id=content_id,
            kind="insight",
            title=f"Note {index}",
            body=f"Body {index}",
        )
    first_page = await service.list_notes(
        profile_id=user_a, content_item_id=content_id, page=1, page_size=2
    )
    second_page = await service.list_notes(
        profile_id=user_a, content_item_id=None, page=2, page_size=2
    )
    assert first_page.total_items == 4
    assert len(first_page.items) == 2
    assert second_page.total_pages == 2
    assert len(second_page.items) == 2

    deleted = await service.delete_note(
        profile_id=user_a,
        note_id=updated_note.id,
        expected_row_version=updated_note.row_version,
    )
    assert deleted.row_version == updated_note.row_version + 1
    assert deleted.sync_cursor == 10
    remaining = await service.list_notes(
        profile_id=user_a, content_item_id=content_id, page=1, page_size=10
    )
    assert remaining.total_items == 3
    with pytest.raises(AppError) as deleted_note:
        await service.delete_note(
            profile_id=user_a,
            note_id=updated_note.id,
            expected_row_version=updated_note.row_version + 1,
        )
    assert deleted_note.value.status == 404

    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        soft_deleted_at = connection.execute(
            text("SELECT deleted_at FROM user_notes WHERE id = :id"), {"id": updated_note.id}
        ).scalar_one()
        event_types = (
            connection.execute(
                text("SELECT event_type FROM activity_events WHERE user_id = :user_id ORDER BY id"),
                {"user_id": user_a},
            )
            .scalars()
            .all()
        )
        changes = (
            connection.execute(
                text(
                    "SELECT cursor, entity_type, entity_id, operation, entity_version "
                    "FROM user_sync_change_log WHERE user_id = :user_id ORDER BY cursor"
                ),
                {"user_id": user_a},
            )
            .mappings()
            .all()
        )
        counter = connection.execute(
            text("SELECT last_cursor FROM user_sync_counters WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
    engine.dispose()
    assert soft_deleted_at is not None
    expected_event_types = {
        "progress_created",
        "bookmark_added",
        "note_created",
        "note_updated",
        "note_deleted",
    }
    assert expected_event_types <= set(event_types)
    assert counter == 10
    assert [(row["entity_type"], row["operation"]) for row in changes] == [
        ("progress", "upsert"),
        ("progress", "upsert"),
        ("bookmark", "upsert"),
        ("bookmark", "delete"),
        ("note", "upsert"),
        ("note", "upsert"),
        ("note", "upsert"),
        ("note", "upsert"),
        ("note", "upsert"),
        ("note", "delete"),
    ]
    assert changes[0]["entity_id"] == content_id
    assert changes[0]["entity_version"] == 1
    assert changes[1]["entity_version"] == 2
    assert changes[2]["entity_id"] == content_id
    assert changes[4]["entity_id"] == note.id
    assert changes[4]["entity_version"] == 1
    assert changes[5]["entity_version"] == 2
    assert changes[-1]["entity_version"] == 3
    feed = await sync.user_changes(
        profile_id=user_a,
        device_id=device.id,
        after=0,
        limit=100,
    )
    assert [change.cursor for change in feed.changes] == list(range(1, 11))

    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE content_items SET archived_at = now() WHERE id = :id"),
            {"id": content_id},
        )
    engine.dispose()
    historical = await service.get_progress(profile_id=user_a, content_item_id=content_id)
    assert historical.status is LearningStatus.ATTEMPTED
    with pytest.raises(AppError) as archived_progress:
        await service.save_progress(
            profile_id=user_a,
            content_item_id=content_id,
            status=LearningStatus.ATTEMPTED,
            confidence=50,
            expected_row_version=historical.row_version,
        )
    assert archived_progress.value.status == 404
    with pytest.raises(AppError):
        await service.add_bookmark(profile_id=user_a, content_item_id=content_id)
    with pytest.raises(AppError):
        await service.create_note(
            profile_id=user_a,
            content_item_id=content_id,
            kind="note",
            title=None,
            body="No new notes on archived content",
        )
    await database.close()


async def test_learning_write_and_user_change_roll_back_together(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_id, category_id, user_id = uuid4(), uuid4(), uuid4()
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": user_id})
        connection.execute(text("INSERT INTO profiles (id) VALUES (:id)"), {"id": user_id})
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Rollback')"),
            {"id": domain_id, "slug": f"rollback-{domain_id.hex[:8]}"},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) "
                "VALUES (:id, :domain, 'rollback', 'Rollback')"
            ),
            {"id": category_id, "domain": domain_id},
        )
        content_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"rollback-{uuid4().hex[:8]}",
            title="Rollback",
        )
    engine.dispose()
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = LearningService(lambda: _FailingLearningUnitOfWork(database.session_factory))
    with pytest.raises(RuntimeError, match="user change failure"):
        await service.save_progress(
            profile_id=user_id,
            content_item_id=content_id,
            status=LearningStatus.LEARNING,
            confidence=20,
            expected_row_version=0,
        )
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        progress_count = connection.execute(
            text(
                "SELECT count(*) FROM user_progress "
                "WHERE user_id = :user AND content_item_id = :content"
            ),
            {"user": user_id, "content": content_id},
        ).scalar_one()
        activity_count = connection.execute(
            text("SELECT count(*) FROM activity_events WHERE user_id = :user"),
            {"user": user_id},
        ).scalar_one()
        change_count = connection.execute(
            text("SELECT count(*) FROM user_sync_change_log WHERE user_id = :user"),
            {"user": user_id},
        ).scalar_one()
        counter_count = connection.execute(
            text("SELECT count(*) FROM user_sync_counters WHERE user_id = :user"),
            {"user": user_id},
        ).scalar_one()
    engine.dispose()
    assert (progress_count, activity_count, change_count, counter_count) == (0, 0, 0, 0)
    await database.close()
