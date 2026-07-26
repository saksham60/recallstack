import asyncio
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.composition.category_content_list_uow import (
    SqlAlchemyCategoryContentReadUnitOfWork,
)
from recallstack.composition.recall_uow import SqlAlchemyRecallUnitOfWork
from recallstack.composition.sync_uow import (
    SqlAlchemySyncRepository,
    SqlAlchemySyncUnitOfWork,
)
from recallstack.modules.content.application.category_content_list import (
    CategoryContentListFilters,
    CategoryContentListService,
)
from recallstack.modules.recall.application.review_submission import (
    DeterministicReviewScheduler,
    RecallService,
)
from recallstack.modules.sync.application.sync_service import (
    MutationCommand,
    SyncRepository,
    SyncService,
    SyncUnitOfWork,
)
from recallstack.modules.sync.infrastructure.sqlalchemy_models import (
    DeviceCatalogSyncStateModel,
    DeviceUserSyncStateModel,
    FullResyncSnapshotModel,
)
from recallstack.shared.config import Settings
from recallstack.shared.database import Database, DatabaseSessionFactory
from recallstack.shared.errors import AppError
from tests.integration.test_published_study_note_repository import add_content

pytestmark = pytest.mark.integration


def _seed_contract_data(url: str) -> tuple[UUID, UUID, UUID, UUID, UUID]:
    engine = create_engine(url)
    user_a, user_b, domain_id, category_id = (uuid4() for _ in range(4))
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
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Offline contracts')"),
            {"id": domain_id, "slug": f"offline-{domain_id.hex[:8]}"},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) "
                "VALUES (:id, :domain, 'arrays', 'Arrays')"
            ),
            {"id": category_id, "domain": domain_id},
        )
        content_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"offline-{uuid4().hex[:8]}",
            title="Version 3",
        )
        connection.execute(
            text("INSERT INTO catalog_sync_counters (domain_id, last_cursor) VALUES (:domain, 1)"),
            {"domain": domain_id},
        )
        connection.execute(
            text(
                "INSERT INTO catalog_sync_change_log "
                "(domain_id, cursor, entity_type, entity_id, operation, "
                "entity_version, retain_until) "
                "VALUES (:domain, 1, 'content_item', :content, 'upsert', 3, "
                "now() + interval '30 days')"
            ),
            {"domain": domain_id, "content": content_id},
        )
    engine.dispose()
    return user_a, user_b, domain_id, category_id, content_id


class _PausingSnapshotRepository(SqlAlchemySyncRepository):
    def __init__(
        self,
        session: AsyncSession,
        established: asyncio.Event,
        resume: asyncio.Event,
        stream_type: str,
    ) -> None:
        super().__init__(session)
        self._established = established
        self._resume = resume
        self._stream_type = stream_type

    async def _after_snapshot_cursor(self, stream_type: str) -> None:
        if stream_type == self._stream_type:
            self._established.set()
            await self._resume.wait()


class _PausingSnapshotUnitOfWork(SyncUnitOfWork):
    def __init__(
        self,
        session_factory: DatabaseSessionFactory[AsyncSession],
        established: asyncio.Event,
        resume: asyncio.Event,
        stream_type: str,
    ) -> None:
        self._session_factory = session_factory
        self._established = established
        self._resume = resume
        self._stream_type = stream_type
        self._session: AsyncSession | None = None
        self.repository: SyncRepository

    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        self.repository = _PausingSnapshotRepository(
            self._session,
            self._established,
            self._resume,
            self._stream_type,
        )
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._session is not None:
            if exc_type is not None:
                await self._session.rollback()
            await self._session.close()

    async def commit(self) -> None:
        assert self._session is not None
        await self._session.commit()


class _FailingSnapshotRepository(SqlAlchemySyncRepository):
    async def _after_snapshot_cursor(self, stream_type: str) -> None:
        raise RuntimeError(f"simulated {stream_type} snapshot failure")


class _FailingSnapshotUnitOfWork(SqlAlchemySyncUnitOfWork):
    async def __aenter__(self) -> Self:
        await super().__aenter__()
        assert self._session is not None
        self.repository = _FailingSnapshotRepository(self._session)
        return self


@pytest.mark.integration
async def test_catalog_full_resync_snapshot_cursor_race_and_ack_are_safe(
    migrated_database_url: str,
) -> None:
    user_a, user_b, domain_id, category_id, content_id = _seed_contract_data(migrated_database_url)
    second_category_id = uuid4()
    primary_resource_id, secondary_resource_id, archived_resource_id = (
        uuid4(),
        uuid4(),
        uuid4(),
    )
    block_id = uuid4()
    provider_slug = f"leetcode-{uuid4().hex[:8]}"
    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name, sort_order) "
                "VALUES (:id, :domain, :slug, 'Second category', 2)"
            ),
            {
                "id": second_category_id,
                "domain": domain_id,
                "slug": f"second-{second_category_id.hex[:8]}",
            },
        )
        connection.execute(
            text(
                "INSERT INTO content_blocks "
                "(id, type, payload, plain_text, content_hash) "
                "VALUES (:id, 'recognize', CAST(:payload AS jsonb), "
                "'Offline body', :content_hash)"
            ),
            {
                "id": block_id,
                "payload": '{"markdown":"Offline body"}',
                "content_hash": "d" * 64,
            },
        )
        connection.execute(
            text(
                "INSERT INTO content_version_blocks "
                "(content_version_id, content_block_id, position, heading) "
                "SELECT current_published_version_id, :block, 0, 'Overview' "
                "FROM content_items WHERE id = :content"
            ),
            {"block": block_id, "content": content_id},
        )
        connection.execute(
            text(
                "UPDATE content_version_categories SET sort_order = 7 "
                "WHERE content_item_id = :content AND category_id = :category"
            ),
            {"content": content_id, "category": category_id},
        )
        connection.execute(
            text(
                "INSERT INTO content_version_categories "
                "(content_version_id, content_item_id, domain_id, category_id, sort_order) "
                "SELECT current_published_version_id, id, domain_id, :category, 2 "
                "FROM content_items WHERE id = :content"
            ),
            {"category": second_category_id, "content": content_id},
        )
        provider_id = connection.execute(
            text(
                "INSERT INTO practice_providers (slug, name, base_url, is_active) "
                "VALUES (:slug, 'LeetCode', 'https://leetcode.com', true) RETURNING id"
            ),
            {"slug": provider_slug},
        ).scalar_one()
        connection.execute(
            text(
                "INSERT INTO practice_resources "
                "(id, content_item_id, provider_id, external_key, url, url_hash, "
                "title, is_primary, sort_order, archived_at) VALUES "
                "(:primary, :content, :provider, 'two-sum', :url, :primary_hash, "
                "'Two Sum', true, 0, NULL), "
                "(:secondary, :content, :provider, 'secondary', :secondary_url, "
                ":secondary_hash, 'Secondary', false, 1, NULL), "
                "(:archived, :content, :provider, 'archived', :archived_url, "
                ":archived_hash, 'Archived', true, 2, now())"
            ),
            {
                "primary": primary_resource_id,
                "secondary": secondary_resource_id,
                "archived": archived_resource_id,
                "content": content_id,
                "provider": provider_id,
                "url": "https://leetcode.com/problems/two-sum",
                "secondary_url": "https://leetcode.com/problems/secondary",
                "archived_url": "https://leetcode.com/problems/archived",
                "primary_hash": "a" * 64,
                "secondary_hash": "b" * 64,
                "archived_hash": "c" * 64,
            },
        )
    engine.dispose()
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    normal = SyncService(
        lambda: SqlAlchemySyncUnitOfWork(database.session_factory),
        retention_days=30,
    )
    device_a = await normal.register_device(
        profile_id=user_a,
        device_name="A",
        platform="android",
        app_version="1",
    )
    device_a2 = await normal.register_device(
        profile_id=user_a,
        device_name="A2",
        platform="android",
        app_version="1",
    )
    device_b = await normal.register_device(
        profile_id=user_b,
        device_name="B",
        platform="android",
        app_version="1",
    )
    established, resume = asyncio.Event(), asyncio.Event()
    pausing = SyncService(
        lambda: _PausingSnapshotUnitOfWork(
            database.session_factory, established, resume, "catalog"
        ),
        retention_days=30,
    )
    snapshot_task = asyncio.create_task(
        pausing.catalog_full_resync(
            profile_id=user_a,
            device_id=device_a.id,
            domain_id=domain_id,
        )
    )
    await asyncio.wait_for(established.wait(), timeout=5)

    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE content_versions SET title = 'Version 4', row_version = 4 "
                "WHERE id = (SELECT current_published_version_id FROM content_items "
                "WHERE id = :content)"
            ),
            {"content": content_id},
        )
        connection.execute(
            text("UPDATE catalog_sync_counters SET last_cursor = 2 WHERE domain_id = :domain"),
            {"domain": domain_id},
        )
        connection.execute(
            text(
                "INSERT INTO catalog_sync_change_log "
                "(domain_id, cursor, entity_type, entity_id, operation, "
                "entity_version, retain_until) "
                "VALUES (:domain, 2, 'content_item', :content, 'upsert', 4, "
                "now() + interval '30 days')"
            ),
            {"domain": domain_id, "content": content_id},
        )
    engine.dispose()
    resume.set()
    snapshot = await snapshot_task

    assert snapshot.snapshot_cursor == 1
    items = snapshot.payload["content_items"]
    assert isinstance(items, list)
    assert items[0]["title"] == "Version 3"
    assert items[0]["category_ids"] == [
        str(second_category_id),
        str(category_id),
    ]
    assert items[0]["category_assignments"] == [
        {"category_id": str(second_category_id), "sort_order": 2},
        {"category_id": str(category_id), "sort_order": 7},
    ]
    primary_resource = items[0]["primary_practice_resource"]
    assert primary_resource == {
        "id": str(primary_resource_id),
        "provider_slug": provider_slug,
        "provider_name": "LeetCode",
        "external_key": "two-sum",
        "title": "Two Sum",
        "url": "https://leetcode.com/problems/two-sum",
        "practice_url": "https://leetcode.com/problems/two-sum",
        "is_primary": True,
        "sort_order": 0,
    }
    assert items[0]["primary_practice_url"] == "https://leetcode.com/problems/two-sum"
    assert snapshot.payload["categories"]
    documents = snapshot.payload["content_documents"]
    assert isinstance(documents, list)
    assert documents[0]["id"] == items[0]["current_published_version_id"]
    assert documents[0]["content_item_id"] == str(content_id)
    assert documents[0]["version_number"] >= 1
    assert documents[0]["blocks"]
    assert documents[0]["blocks"][0] == {
        "id": str(block_id),
        "position": 0,
        "heading": "Overview",
        "type": "recognize",
        "payload": {"markdown": "Offline body"},
    }
    assert str(secondary_resource_id) not in str(snapshot.payload)
    assert str(archived_resource_id) not in str(snapshot.payload)

    async with database.session_factory.create_session() as session:
        state = await session.get(DeviceCatalogSyncStateModel, (device_a.id, domain_id))
        record = await session.get(FullResyncSnapshotModel, snapshot.snapshot_id)
    assert state is None
    assert record is not None and record.acknowledged_at is None

    with pytest.raises(AppError) as cross_user:
        await normal.acknowledge_full_resync(
            profile_id=user_b,
            device_id=device_b.id,
            snapshot_id=snapshot.snapshot_id,
            snapshot_cursor=snapshot.snapshot_cursor,
            stream_type="catalog",
            domain_id=domain_id,
        )
    assert cross_user.value.status == 404
    with pytest.raises(AppError) as wrong_cursor:
        await normal.acknowledge_full_resync(
            profile_id=user_a,
            device_id=device_a.id,
            snapshot_id=snapshot.snapshot_id,
            snapshot_cursor=999,
            stream_type="catalog",
            domain_id=domain_id,
        )
    assert wrong_cursor.value.status == 409
    with pytest.raises(AppError) as wrong_device:
        await normal.acknowledge_full_resync(
            profile_id=user_a,
            device_id=device_a2.id,
            snapshot_id=snapshot.snapshot_id,
            snapshot_cursor=snapshot.snapshot_cursor,
            stream_type="catalog",
            domain_id=domain_id,
        )
    assert wrong_device.value.status == 404
    with pytest.raises(AppError) as unknown_snapshot:
        await normal.acknowledge_full_resync(
            profile_id=user_a,
            device_id=device_a.id,
            snapshot_id=uuid4(),
            snapshot_cursor=snapshot.snapshot_cursor,
            stream_type="catalog",
            domain_id=domain_id,
        )
    assert unknown_snapshot.value.status == 404
    other_domain = uuid4()
    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Other')"),
            {"id": other_domain, "slug": f"other-{other_domain.hex[:8]}"},
        )
    engine.dispose()
    with pytest.raises(AppError) as wrong_domain:
        await normal.acknowledge_full_resync(
            profile_id=user_a,
            device_id=device_a.id,
            snapshot_id=snapshot.snapshot_id,
            snapshot_cursor=snapshot.snapshot_cursor,
            stream_type="catalog",
            domain_id=other_domain,
        )
    assert wrong_domain.value.status == 404

    first_ack = await normal.acknowledge_full_resync(
        profile_id=user_a,
        device_id=device_a.id,
        snapshot_id=snapshot.snapshot_id,
        snapshot_cursor=snapshot.snapshot_cursor,
        stream_type="catalog",
        domain_id=domain_id,
    )
    second_ack = await normal.acknowledge_full_resync(
        profile_id=user_a,
        device_id=device_a.id,
        snapshot_id=snapshot.snapshot_id,
        snapshot_cursor=snapshot.snapshot_cursor,
        stream_type="catalog",
        domain_id=domain_id,
    )
    assert first_ack == second_ack
    feed = await normal.catalog_changes(
        profile_id=user_a,
        device_id=device_a.id,
        domain_id=domain_id,
        after=snapshot.snapshot_cursor,
        limit=100,
    )
    assert [change.cursor for change in feed.changes] == [2]
    post_commit_snapshot = await normal.catalog_full_resync(
        profile_id=user_a,
        device_id=device_a.id,
        domain_id=domain_id,
    )
    assert post_commit_snapshot.snapshot_cursor == 2
    post_commit_items = post_commit_snapshot.payload["content_items"]
    assert isinstance(post_commit_items, list)
    assert post_commit_items[0]["title"] == "Version 4"
    catalog_service = CategoryContentListService(
        lambda: SqlAlchemyCategoryContentReadUnitOfWork(database.session_factory)
    )
    normal_page = await catalog_service.query(
        category_id=category_id,
        profile_id=user_a,
        filters=CategoryContentListFilters(
            content_type=None,
            difficulty=None,
            status=None,
            topic_slug=None,
            search=None,
            page=1,
            page_size=100,
            sort="sort_order",
        ),
    )
    normal_item = normal_page.items[0]
    assert normal_item.content_item_id == UUID(post_commit_items[0]["id"])
    assert normal_item.title == post_commit_items[0]["title"]
    assert normal_item.summary == post_commit_items[0]["summary"]
    assert normal_item.difficulty == post_commit_items[0]["difficulty"]
    assert normal_item.primary_practice_resource is not None
    assert (
        str(normal_item.primary_practice_resource.id)
        == post_commit_items[0]["primary_practice_resource"]["id"]
    )
    assert normal_item.primary_practice_resource.url == post_commit_items[0]["primary_practice_url"]
    await normal.acknowledge_full_resync(
        profile_id=user_a,
        device_id=device_a.id,
        snapshot_id=post_commit_snapshot.snapshot_id,
        snapshot_cursor=2,
        stream_type="catalog",
        domain_id=domain_id,
    )
    post_commit_feed = await normal.catalog_changes(
        profile_id=user_a,
        device_id=device_a.id,
        domain_id=domain_id,
        after=2,
        limit=100,
    )
    assert post_commit_feed.changes == ()
    async with database.session_factory.create_session() as session:
        snapshot_count_before_failure = int(
            await session.scalar(
                text("SELECT count(*) FROM full_resync_snapshots WHERE user_id = :user"),
                {"user": user_a},
            )
            or 0
        )
    failing = SyncService(
        lambda: _FailingSnapshotUnitOfWork(database.session_factory),
        retention_days=30,
    )
    with pytest.raises(RuntimeError, match="snapshot failure"):
        await failing.catalog_full_resync(
            profile_id=user_a,
            device_id=device_a.id,
            domain_id=domain_id,
        )
    async with database.session_factory.create_session() as session:
        snapshot_count_after_failure = int(
            await session.scalar(
                text("SELECT count(*) FROM full_resync_snapshots WHERE user_id = :user"),
                {"user": user_a},
            )
            or 0
        )
    assert snapshot_count_after_failure == snapshot_count_before_failure
    await database.close()


@pytest.mark.integration
async def test_user_full_resync_contains_all_projections_and_ack_is_owned(
    migrated_database_url: str,
) -> None:
    user_a, user_b, domain_id, category_id, content_id = _seed_contract_data(migrated_database_url)
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = SyncService(
        lambda: SqlAlchemySyncUnitOfWork(database.session_factory),
        retention_days=30,
    )
    device = await service.register_device(
        profile_id=user_a,
        device_name="A",
        platform="android",
        app_version="1",
    )
    other_device = await service.register_device(
        profile_id=user_b,
        device_name="B",
        platform="android",
        app_version="1",
    )
    note_id, card_id = uuid4(), uuid4()
    overdue_card_id, due_now_card_id, suspended_card_id = uuid4(), uuid4(), uuid4()
    review_now = datetime.now(UTC)
    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        overdue_content_id = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"overdue-{uuid4().hex[:8]}",
            title="Overdue",
        )[0]
        due_now_content_id = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"due-now-{uuid4().hex[:8]}",
            title="Due now",
        )[0]
        suspended_content_id = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"suspended-user-snapshot-{uuid4().hex[:8]}",
            title="Suspended",
        )[0]
        connection.execute(
            text(
                "INSERT INTO user_progress "
                "(user_id, content_item_id, status, confidence, row_version) "
                "VALUES (:user, :content, 'learning', 50, 2)"
            ),
            {"user": user_a, "content": content_id},
        )
        connection.execute(
            text("INSERT INTO bookmarks (user_id, content_item_id) VALUES (:user, :content)"),
            {"user": user_a, "content": content_id},
        )
        connection.execute(
            text(
                "INSERT INTO user_notes "
                "(id, user_id, content_item_id, kind, body, row_version) "
                "VALUES (:id, :user, :content, 'note', 'Offline note', 3)"
            ),
            {
                "id": note_id,
                "user": user_a,
                "content": content_id,
            },
        )
        connection.execute(
            text(
                "INSERT INTO review_cards "
                "(id, user_id, content_item_id, due_at, row_version) "
                "VALUES (:id, :user, :content, now() + interval '1 day', 4)"
            ),
            {"id": card_id, "user": user_a, "content": content_id},
        )
        connection.execute(
            text(
                "INSERT INTO review_cards "
                "(id, user_id, content_item_id, due_at, row_version, suspended_at) "
                "VALUES "
                "(:overdue, :user, :overdue_content, :overdue_at, 2, NULL), "
                "(:due_now, :user, :due_now_content, :due_now_at, 3, NULL), "
                "(:suspended, :user, :suspended_content, :future_at, 5, now())"
            ),
            {
                "overdue": overdue_card_id,
                "due_now": due_now_card_id,
                "suspended": suspended_card_id,
                "user": user_a,
                "overdue_content": overdue_content_id,
                "due_now_content": due_now_content_id,
                "suspended_content": suspended_content_id,
                "overdue_at": review_now - timedelta(days=1),
                "due_now_at": review_now,
                "future_at": review_now + timedelta(days=2),
            },
        )
        connection.execute(
            text("INSERT INTO user_sync_counters (user_id, last_cursor) VALUES (:user, 8)"),
            {"user": user_a},
        )
        connection.execute(
            text(
                "UPDATE device_user_sync_state SET full_resync_required = true "
                "WHERE device_id = :device"
            ),
            {"device": device.id},
        )
    engine.dispose()

    established, resume = asyncio.Event(), asyncio.Event()
    pausing = SyncService(
        lambda: _PausingSnapshotUnitOfWork(database.session_factory, established, resume, "user"),
        retention_days=30,
    )
    snapshot_task = asyncio.create_task(
        pausing.user_full_resync(profile_id=user_a, device_id=device.id)
    )
    await asyncio.wait_for(established.wait(), timeout=5)
    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE user_notes SET body = 'New server body', row_version = 4 WHERE id = :id"),
            {"id": note_id},
        )
        connection.execute(
            text("UPDATE user_sync_counters SET last_cursor = 9 WHERE user_id = :user"),
            {"user": user_a},
        )
        connection.execute(
            text(
                "INSERT INTO user_sync_change_log "
                "(user_id, cursor, entity_type, entity_id, operation, "
                "entity_version, retain_until) "
                "VALUES (:user, 9, 'note', :note, 'upsert', 4, "
                "now() + interval '30 days')"
            ),
            {"user": user_a, "note": note_id},
        )
    engine.dispose()
    resume.set()
    snapshot = await snapshot_task
    assert snapshot.snapshot_cursor == 8
    assert len(snapshot.payload["progress"]) == 1
    assert len(snapshot.payload["bookmarks"]) == 1
    assert snapshot.payload["notes"][0]["body"] == "Offline note"
    review_cards = snapshot.payload["review_cards"]
    assert isinstance(review_cards, list)
    states = {item["id"]: item["state"] for item in review_cards}
    assert states == {
        str(overdue_card_id): "due",
        str(due_now_card_id): "due",
        str(card_id): "scheduled",
    }
    assert str(suspended_card_id) not in states
    assert all(item["next_review_at"] for item in review_cards)

    async with database.session_factory.create_session() as session:
        state = await session.get(DeviceUserSyncStateModel, device.id)
    assert state is not None and state.full_resync_required is True

    with pytest.raises(AppError) as cross_user:
        await service.acknowledge_full_resync(
            profile_id=user_b,
            device_id=other_device.id,
            snapshot_id=snapshot.snapshot_id,
            snapshot_cursor=8,
            stream_type="user",
        )
    assert cross_user.value.status == 404
    expired = await service.user_full_resync(profile_id=user_a, device_id=device.id)
    assert expired.snapshot_cursor == 9
    assert expired.payload["notes"][0]["body"] == "New server body"
    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE full_resync_snapshots "
                "SET created_at = now() - interval '2 hours', "
                "expires_at = now() - interval '1 hour' WHERE id = :id"
            ),
            {"id": expired.snapshot_id},
        )
    engine.dispose()
    with pytest.raises(AppError) as expired_error:
        await service.acknowledge_full_resync(
            profile_id=user_a,
            device_id=device.id,
            snapshot_id=expired.snapshot_id,
            snapshot_cursor=expired.snapshot_cursor,
            stream_type="user",
        )
    assert expired_error.value.status == 410
    await service.acknowledge_full_resync(
        profile_id=user_a,
        device_id=device.id,
        snapshot_id=snapshot.snapshot_id,
        snapshot_cursor=8,
        stream_type="user",
    )
    await service.acknowledge_full_resync(
        profile_id=user_a,
        device_id=device.id,
        snapshot_id=snapshot.snapshot_id,
        snapshot_cursor=8,
        stream_type="user",
    )
    async with database.session_factory.create_session() as session:
        state = await session.get(DeviceUserSyncStateModel, device.id)
    assert state is not None
    assert state.full_resync_required is False
    assert state.last_user_cursor == 8
    feed = await service.user_changes(
        profile_id=user_a,
        device_id=device.id,
        after=snapshot.snapshot_cursor,
        limit=100,
    )
    assert [change.cursor for change in feed.changes] == [9]
    async with database.session_factory.create_session() as session:
        state_before_failure = await session.get(DeviceUserSyncStateModel, device.id)
        snapshot_count_before_failure = int(
            await session.scalar(
                text("SELECT count(*) FROM full_resync_snapshots WHERE user_id = :user"),
                {"user": user_a},
            )
            or 0
        )
    assert state_before_failure is not None
    failing = SyncService(
        lambda: _FailingSnapshotUnitOfWork(database.session_factory),
        retention_days=30,
    )
    with pytest.raises(RuntimeError, match="snapshot failure"):
        await failing.user_full_resync(profile_id=user_a, device_id=device.id)
    async with database.session_factory.create_session() as session:
        state = await session.get(DeviceUserSyncStateModel, device.id)
        snapshot_count_after_failure = int(
            await session.scalar(
                text("SELECT count(*) FROM full_resync_snapshots WHERE user_id = :user"),
                {"user": user_a},
            )
            or 0
        )
    assert state is not None
    assert state.last_user_cursor == state_before_failure.last_user_cursor
    assert snapshot_count_after_failure == snapshot_count_before_failure
    await database.close()


@pytest.mark.integration
async def test_all_scheduled_reviews_and_structured_note_conflicts_are_isolated(
    migrated_database_url: str,
) -> None:
    user_a, user_b, domain_id, category_id, content_id = _seed_contract_data(migrated_database_url)
    now = datetime.now(UTC)
    engine = create_engine(migrated_database_url)
    card_ids = [uuid4(), uuid4(), uuid4()]
    suspended_card_id = uuid4()
    note_id = uuid4()
    with engine.begin() as connection:
        content_ids = [
            content_id,
            add_content(
                connection,
                domain_id=domain_id,
                category_id=category_id,
                slug=f"tomorrow-{uuid4().hex[:8]}",
                title="Tomorrow",
            )[0],
            add_content(
                connection,
                domain_id=domain_id,
                category_id=category_id,
                slug=f"next-week-{uuid4().hex[:8]}",
                title="Next week",
            )[0],
        ]
        for card_id, due_at, review_content_id in zip(
            card_ids,
            [now - timedelta(hours=1), now + timedelta(days=1), now + timedelta(days=7)],
            content_ids,
            strict=True,
        ):
            connection.execute(
                text(
                    "INSERT INTO review_cards "
                    "(id, user_id, content_item_id, due_at, row_version) "
                    "VALUES (:id, :user, :content, :due, 4)"
                ),
                {
                    "id": card_id,
                    "user": user_a,
                    "content": review_content_id,
                    "due": due_at,
                },
            )
        suspended_content_id = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"suspended-{uuid4().hex[:8]}",
            title="Suspended",
        )[0]
        connection.execute(
            text(
                "INSERT INTO review_cards "
                "(id, user_id, content_item_id, due_at, row_version, suspended_at) "
                "VALUES (:id, :user, :content, :due, 4, now())"
            ),
            {
                "id": suspended_card_id,
                "user": user_a,
                "content": suspended_content_id,
                "due": now + timedelta(hours=2),
            },
        )
        connection.execute(
            text(
                "INSERT INTO user_notes "
                "(id, user_id, content_item_id, kind, body, row_version) "
                "VALUES (:id, :user, :content, 'note', 'Server body', 4)"
            ),
            {"id": note_id, "user": user_a, "content": content_id},
        )
    engine.dispose()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    recall = RecallService(
        lambda: SqlAlchemyRecallUnitOfWork(database.session_factory),
        DeterministicReviewScheduler(),
        None,
    )
    total, scheduled = await recall.scheduled(
        profile_id=user_a,
        page=1,
        page_size=100,
        due_after=None,
        due_before=None,
        state=None,
    )
    due_total, due = await recall.due(profile_id=user_a, page=1, page_size=100)
    assert total == 3
    assert [item.id for item in scheduled] == card_ids
    assert all(item.next_review_at for item in scheduled)
    assert due_total == 1
    assert [item.card_id for item in due] == [card_ids[0]]
    page_one_total, page_one = await recall.scheduled(
        profile_id=user_a,
        page=1,
        page_size=2,
        due_after=None,
        due_before=None,
        state=None,
    )
    page_two_total, page_two = await recall.scheduled(
        profile_id=user_a,
        page=2,
        page_size=2,
        due_after=None,
        due_before=None,
        state=None,
    )
    assert page_one_total == page_two_total == 3
    assert [item.id for item in (*page_one, *page_two)] == card_ids
    future_total, future = await recall.scheduled(
        profile_id=user_a,
        page=1,
        page_size=100,
        due_after=None,
        due_before=None,
        state="scheduled",
    )
    assert future_total == 2
    assert [item.id for item in future] == card_ids[1:]
    other_total, _ = await recall.scheduled(
        profile_id=user_b,
        page=1,
        page_size=100,
        due_after=None,
        due_before=None,
        state=None,
    )
    assert other_total == 0

    sync = SyncService(
        lambda: SqlAlchemySyncUnitOfWork(database.session_factory),
        retention_days=30,
    )
    device_a = await sync.register_device(
        profile_id=user_a,
        device_name="A",
        platform="android",
        app_version="1",
    )
    device_b = await sync.register_device(
        profile_id=user_b,
        device_name="B",
        platform="android",
        app_version="1",
    )
    stale = MutationCommand(
        uuid4(),
        device_a.id,
        "note",
        note_id,
        "update",
        2,
        {"body": "Client body"},
    )
    conflict = (await sync.process_batch(profile_id=user_a, commands=(stale,)))[0]
    assert conflict.status == "conflict"
    assert conflict.error_code == "stale-note-version"
    assert conflict.conflict is not None
    assert conflict.conflict.expected_row_version == 2
    assert conflict.conflict.current_row_version == 4
    assert conflict.conflict.server_entity["body"] == "Server body"
    replay = (await sync.process_batch(profile_id=user_a, commands=(stale,)))[0]
    assert replay.status == "conflict"
    assert replay.deduplicated is True

    attack = MutationCommand(
        uuid4(),
        device_b.id,
        "note",
        note_id,
        "update",
        2,
        {"body": "Attack"},
    )
    rejected = (await sync.process_batch(profile_id=user_b, commands=(attack,)))[0]
    assert rejected.status == "rejected"
    assert rejected.conflict is None
    async with database.session_factory.create_session() as session:
        body, version = (
            await session.execute(
                text("SELECT body, row_version FROM user_notes WHERE id = :id"),
                {"id": note_id},
            )
        ).one()
    assert (body, version) == ("Server body", 4)

    correct = MutationCommand(
        uuid4(),
        device_a.id,
        "note",
        note_id,
        "update",
        4,
        {"body": "Resolved body"},
    )
    applied = (await sync.process_batch(profile_id=user_a, commands=(correct,)))[0]
    assert applied.status == "applied"
    stale_delete = MutationCommand(
        uuid4(),
        device_a.id,
        "note",
        note_id,
        "delete",
        2,
        {},
    )
    delete_conflict = (await sync.process_batch(profile_id=user_a, commands=(stale_delete,)))[0]
    assert delete_conflict.status == "conflict"
    assert delete_conflict.conflict is not None
    assert delete_conflict.conflict.current_row_version == 5
    assert delete_conflict.conflict.server_entity["body"] == "Resolved body"
    missing_note = MutationCommand(
        uuid4(),
        device_a.id,
        "note",
        uuid4(),
        "update",
        1,
        {"body": "Missing"},
    )
    bookmark = MutationCommand(
        uuid4(),
        device_a.id,
        "bookmark",
        content_id,
        "insert",
        None,
        {},
    )
    mixed = await sync.process_batch(
        profile_id=user_a,
        commands=(correct, missing_note, stale_delete, bookmark),
    )
    assert [item.status for item in mixed] == [
        "duplicate",
        "rejected",
        "conflict",
        "applied",
    ]
    await database.close()
