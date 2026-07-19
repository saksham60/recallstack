import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text

from recallstack.composition.sync_uow import SqlAlchemySyncUnitOfWork
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import DomainModel
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel,
    ContentType,
    ContentVersionModel,
    DifficultyLevel,
    PublicationStatus,
)
from recallstack.modules.identity.infrastructure.sqlalchemy_models import ProfileModel
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    BookmarkModel,
    UserNoteModel,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeProviderModel,
    PracticeResourceModel,
)
from recallstack.modules.sync.application.sync_service import MutationCommand, SyncService
from recallstack.modules.sync.infrastructure.sqlalchemy_models import (
    CatalogSyncChangeLogModel,
    CatalogSyncCounterModel,
    ChangeOperation,
    MutationStatus,
    SyncMutationModel,
    UserSyncChangeLogModel,
)
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.errors import AppError
from tests.conftest import TEST_PUBLISHER_PROFILE_ID


async def _profile(database: Database) -> UUID:
    profile_id = uuid4()
    async with database.session_factory.create_session() as session, session.begin():
        await session.execute(text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": profile_id})
        session.add(ProfileModel(id=profile_id, display_name="Sync user"))
    return profile_id


async def _published_content(database: Database) -> tuple[UUID, UUID]:
    now = datetime.now(UTC)
    async with database.session_factory.create_session() as session, session.begin():
        domain = DomainModel(slug=f"sync-{uuid4()}", name="Sync domain", is_active=True)
        provider = PracticeProviderModel(
            slug=f"sync-provider-{uuid4()}", name="Sync provider", is_active=True
        )
        session.add_all([domain, provider])
        await session.flush()
        item = ContentItemModel(
            domain_id=domain.id,
            slug=f"sync-content-{uuid4()}",
            type=ContentType.PROBLEM,
            difficulty=DifficultyLevel.EASY,
            created_by=TEST_PUBLISHER_PROFILE_ID,
        )
        session.add(item)
        await session.flush()
        version = ContentVersionModel(
            content_item_id=item.id,
            version_number=1,
            status=PublicationStatus.PUBLISHED,
            title="Sync content",
            authored_by=TEST_PUBLISHER_PROFILE_ID,
            reviewed_by=TEST_PUBLISHER_PROFILE_ID,
            published_by=TEST_PUBLISHER_PROFILE_ID,
            published_at=now,
            row_version=1,
        )
        session.add(version)
        await session.flush()
        item.current_published_version_id = version.id
        url = f"https://example.com/{item.id}"
        session.add(
            PracticeResourceModel(
                content_item_id=item.id,
                provider_id=provider.id,
                url=url,
                url_hash=hashlib.sha256(url.encode()).hexdigest(),
                title="Primary",
                is_primary=True,
            )
        )
        return item.id, domain.id


def _progress(
    *,
    mutation_id: UUID,
    device_id: UUID,
    content_id: UUID,
    confidence: int = 20,
    operation: str = "insert",
    version: int | None = None,
) -> MutationCommand:
    return MutationCommand(
        mutation_id,
        device_id,
        "progress",
        content_id,
        operation,
        version,
        {"status": "learning", "confidence": confidence},
    )


@pytest.mark.integration
async def test_sync_mutations_are_retry_safe_ordered_scoped_and_use_online_services(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = SyncService(
        lambda: SqlAlchemySyncUnitOfWork(database.session_factory), retention_days=1
    )
    now = datetime.now(UTC)
    try:
        profile_id = await _profile(database)
        other_id = await _profile(database)
        content_id, domain_id = await _published_content(database)
        device = await service.register_device(
            profile_id=profile_id, device_name="Primary", platform="android", app_version="1.0"
        )
        lagging_device = await service.register_device(
            profile_id=profile_id, device_name="Lagging", platform="web", app_version=None
        )
        other_device = await service.register_device(
            profile_id=other_id, device_name="Other", platform="ios", app_version=None
        )

        command = _progress(mutation_id=uuid4(), device_id=device.id, content_id=content_id)
        applied = await service.process_mutation(profile_id=profile_id, command=command)
        duplicate = await service.process_mutation(profile_id=profile_id, command=command)
        assert applied.status == "applied"
        assert applied.cursor == 1
        assert applied.resulting_row_version == 1
        assert duplicate.deduplicated is True
        assert duplicate.status == "applied"
        assert duplicate.cursor == applied.cursor
        assert duplicate.resulting_row_version == applied.resulting_row_version
        assert duplicate.result == applied.result

        changed = _progress(
            mutation_id=command.mutation_id,
            device_id=device.id,
            content_id=content_id,
            confidence=90,
        )
        with pytest.raises(AppError) as changed_error:
            await service.process_mutation(profile_id=profile_id, command=changed)
        assert changed_error.value.status == 409
        assert changed_error.value.error_type == "mutation-id-conflict"

        foreign = _progress(mutation_id=uuid4(), device_id=other_device.id, content_id=content_id)
        with pytest.raises(AppError) as ownership_error:
            await service.process_mutation(profile_id=profile_id, command=foreign)
        assert ownership_error.value.status == 404

        note_id = uuid4()
        note = MutationCommand(
            uuid4(),
            device.id,
            "note",
            note_id,
            "insert",
            None,
            {
                "content_item_id": str(content_id),
                "kind": "insight",
                "title": "Offline insight",
                "body": "Created through the shared Learning service.",
            },
        )
        note_result = await service.process_mutation(profile_id=profile_id, command=note)
        assert note_result.cursor == 2
        assert note_result.resulting_row_version == 1
        duplicate_after_change = await service.process_mutation(
            profile_id=profile_id, command=command
        )
        assert duplicate_after_change.cursor == applied.cursor
        assert duplicate_after_change.result == applied.result

        attempt_event_id = uuid4()
        attempt = MutationCommand(
            uuid4(),
            device.id,
            "practice_attempt",
            attempt_event_id,
            "insert",
            None,
            {
                "content_item_id": str(content_id),
                "practice_resource_id": None,
                "outcome": "solved_independently",
                "duration_seconds": 60,
                "hint_used": False,
                "confidence_before": 20,
                "confidence_after": 80,
                "attempted_at": now.isoformat(),
            },
        )
        attempt_result = await service.process_mutation(profile_id=profile_id, command=attempt)
        assert attempt_result.cursor == 3
        assert attempt_result.result is not None
        card_id = UUID(str(attempt_result.result["review_card_id"]))

        review = MutationCommand(
            uuid4(),
            device.id,
            "review",
            card_id,
            "insert",
            None,
            {
                "review_event_id": str(uuid4()),
                "rating": "good",
                "response_time_ms": 800,
                "reviewed_at": now.isoformat(),
                "expected_row_version": 1,
            },
        )
        review_result = await service.process_mutation(profile_id=profile_id, command=review)
        assert review_result.cursor == 4
        assert review_result.resulting_row_version == 2

        stale = _progress(
            mutation_id=uuid4(),
            device_id=device.id,
            content_id=content_id,
            operation="update",
            version=999,
        )
        valid_bookmark = MutationCommand(
            uuid4(), device.id, "bookmark", content_id, "insert", None, {}
        )
        batch = await service.process_batch(profile_id=profile_id, commands=(stale, valid_bookmark))
        assert [item.status for item in batch] == ["rejected", "applied"]
        assert batch[1].cursor == 5
        rejected_retry = (await service.process_batch(profile_id=profile_id, commands=(stale,)))[0]
        assert rejected_retry.deduplicated is True
        assert rejected_retry.status == "rejected"
        assert rejected_retry.error_code == batch[0].error_code
        assert rejected_retry.cursor is None

        feed = await service.user_changes(
            profile_id=profile_id, device_id=device.id, after=0, limit=100
        )
        assert [change.cursor for change in feed.changes] == [1, 2, 3, 4, 5]
        assert feed.next_cursor == 5
        assert feed.full_resync_required is False

        async with database.session_factory.create_session() as session:
            stored_note = await session.get(UserNoteModel, note_id)
            bookmark = await session.get(BookmarkModel, (profile_id, content_id))
            rejected = await session.get(SyncMutationModel, stale.mutation_id)
        assert stored_note is not None and stored_note.user_id == profile_id
        assert bookmark is not None
        assert rejected is not None and rejected.status == MutationStatus.REJECTED

        revoked = await service.revoke_device(profile_id=profile_id, device_id=device.id)
        assert revoked.revoked_at is not None
        revoked_again = await service.revoke_device(profile_id=profile_id, device_id=device.id)
        assert revoked_again.revoked_at == revoked.revoked_at
        with pytest.raises(AppError):
            await service.user_changes(
                profile_id=profile_id, device_id=device.id, after=0, limit=100
            )

        async with database.session_factory.create_session() as session, session.begin():
            session.add(CatalogSyncCounterModel(domain_id=domain_id, last_cursor=1))
            session.add(
                CatalogSyncChangeLogModel(
                    domain_id=domain_id,
                    cursor=1,
                    entity_type="content_item",
                    entity_id=content_id,
                    operation=ChangeOperation.UPSERT,
                    entity_version=1,
                    retain_until=now + timedelta(days=1),
                )
            )
        catalog = await service.catalog_changes(
            profile_id=profile_id,
            device_id=lagging_device.id,
            domain_id=domain_id,
            after=0,
            limit=100,
        )
        assert len(catalog.changes) == 1
    finally:
        await database.close()


@pytest.mark.integration
async def test_concurrent_duplicate_and_compaction_require_full_resync(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = SyncService(
        lambda: SqlAlchemySyncUnitOfWork(database.session_factory), retention_days=1
    )
    try:
        profile_id = await _profile(database)
        content_id, _ = await _published_content(database)
        writing = await service.register_device(
            profile_id=profile_id, device_name="Writer", platform="android", app_version=None
        )
        lagging = await service.register_device(
            profile_id=profile_id, device_name="Lagging", platform="web", app_version=None
        )
        command = _progress(mutation_id=uuid4(), device_id=writing.id, content_id=content_id)
        first, second = await asyncio.gather(
            service.process_mutation(profile_id=profile_id, command=command),
            service.process_mutation(profile_id=profile_id, command=command),
        )
        assert {first.deduplicated, second.deduplicated} == {False, True}
        async with database.session_factory.create_session() as session:
            changes = (
                await session.scalars(
                    select(UserSyncChangeLogModel).where(
                        UserSyncChangeLogModel.user_id == profile_id
                    )
                )
            ).all()
        assert len(changes) == 1

        note_commands = tuple(
            MutationCommand(
                uuid4(),
                writing.id,
                "note",
                uuid4(),
                "insert",
                None,
                {
                    "content_item_id": str(content_id),
                    "kind": "note",
                    "title": f"Concurrent {index}",
                    "body": "Concurrent cursor allocation",
                },
            )
            for index in range(2)
        )
        concurrent_changes = await asyncio.gather(
            *(
                service.process_mutation(profile_id=profile_id, command=mutation)
                for mutation in note_commands
            )
        )
        assert {result.cursor for result in concurrent_changes} == {2, 3}

        compacted = await service.compact(now=datetime.now(UTC) + timedelta(days=2))
        assert compacted.mutations_deleted >= 1
        assert compacted.user_changes_deleted >= 1
        assert compacted.user_devices_marked_for_resync >= 1
        feed = await service.user_changes(
            profile_id=profile_id, device_id=lagging.id, after=0, limit=100
        )
        assert feed.full_resync_required is True
        assert feed.changes == ()
    finally:
        await database.close()
