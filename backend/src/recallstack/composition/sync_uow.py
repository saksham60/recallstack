from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Any, Self, cast
from uuid import UUID

from sqlalchemy import and_, delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.catalog.infrastructure.sqlalchemy_models import CategoryModel, DomainModel
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentBlockModel,
    ContentItemModel,
    ContentVersionBlockModel,
    ContentVersionCategoryModel,
    ContentVersionModel,
    PublicationStatus,
)
from recallstack.modules.learning.application.learning_state import (
    LearningService,
    LearningStateRepository,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.learning_state_repository import (
    SqlAlchemyLearningStateRepository,
)
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    BookmarkModel,
    UserNoteModel,
    UserProgressModel,
)
from recallstack.modules.practice.application.attempt_submission import (
    DeterministicInitialReviewScheduler,
    PracticeAttemptRepository,
    PracticeAttemptService,
    SubmitPracticeAttempt,
)
from recallstack.modules.practice.infrastructure.attempt_submission_repository import (
    SqlAlchemyPracticeAttemptRepository,
)
from recallstack.modules.recall.application.review_submission import (
    DeterministicReviewScheduler,
    RecallRepository,
    RecallService,
    SubmitReview,
)
from recallstack.modules.recall.infrastructure.review_repository import SqlAlchemyRecallRepository
from recallstack.modules.recall.infrastructure.sqlalchemy_models import ReviewCardModel
from recallstack.modules.sync.application.sync_service import (
    AppliedMutation,
    Change,
    ChangeFeed,
    CompactionResult,
    Device,
    FullResyncAck,
    FullResyncSnapshot,
    MutationCommand,
    MutationConflict,
    MutationRecord,
    SyncRepository,
    SyncUnitOfWork,
)
from recallstack.modules.sync.infrastructure.sqlalchemy_models import (
    CatalogSyncChangeLogModel,
    CatalogSyncCounterModel,
    ChangeOperation,
    DeviceCatalogSyncStateModel,
    DeviceModel,
    DeviceUserSyncStateModel,
    FullResyncSnapshotModel,
    MutationOperation,
    MutationStatus,
    SyncMutationModel,
    UserSyncChangeLogModel,
    UserSyncCounterModel,
)
from recallstack.shared.database import DatabaseSessionFactory
from recallstack.shared.errors import AppError


class _AmbientLearningUnitOfWork:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self.repository: LearningStateRepository = SqlAlchemyLearningStateRepository(session)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return None

    async def commit(self) -> None:
        await self._session.flush()


class _AmbientPracticeUnitOfWork:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self.repository: PracticeAttemptRepository = SqlAlchemyPracticeAttemptRepository(session)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return None

    async def commit(self) -> None:
        await self._session.flush()


class _AmbientRecallUnitOfWork:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self.repository: RecallRepository = SqlAlchemyRecallRepository(session)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return None

    async def commit(self) -> None:
        await self._session.flush()


class SqlAlchemySyncRepository(SyncRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def register_device(
        self, *, profile_id: UUID, device_name: str | None, platform: str, app_version: str | None
    ) -> Device:
        model = DeviceModel(
            user_id=profile_id,
            device_name=device_name,
            platform=platform,
            app_version=app_version,
            last_seen_at=datetime.now(UTC),
        )
        self._session.add(model)
        await self._session.flush()
        self._session.add(DeviceUserSyncStateModel(device_id=model.id))
        await self._session.flush()
        return self._device(model)

    async def list_devices(
        self, *, profile_id: UUID, offset: int, limit: int
    ) -> tuple[int, tuple[Device, ...]]:
        condition = DeviceModel.user_id == profile_id
        total = int(
            await self._session.scalar(
                select(func.count()).select_from(DeviceModel).where(condition)
            )
            or 0
        )
        models = (
            await self._session.scalars(
                select(DeviceModel)
                .where(condition)
                .order_by(DeviceModel.registered_at.desc(), DeviceModel.id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return total, tuple(self._device(model) for model in models)

    async def revoke_device(self, *, profile_id: UUID, device_id: UUID) -> Device | None:
        model = await self._session.scalar(
            select(DeviceModel)
            .where(DeviceModel.id == device_id, DeviceModel.user_id == profile_id)
            .with_for_update()
        )
        if model is None:
            return None
        if model.revoked_at is None:
            model.revoked_at = datetime.now(UTC)
            await self._session.flush()
        return self._device(model)

    async def active_device_owned_by(self, *, profile_id: UUID, device_id: UUID) -> bool:
        return (
            await self._session.scalar(
                select(DeviceModel.id).where(
                    DeviceModel.id == device_id,
                    DeviceModel.user_id == profile_id,
                    DeviceModel.revoked_at.is_(None),
                )
            )
        ) is not None

    async def claim_mutation(
        self,
        *,
        profile_id: UUID,
        command: MutationCommand,
        request_hash: str,
        retention_days: int,
    ) -> tuple[MutationRecord, bool]:
        now = datetime.now(UTC)
        claimed_id = await self._session.scalar(
            insert(SyncMutationModel)
            .values(
                mutation_id=command.mutation_id,
                user_id=profile_id,
                device_id=command.device_id,
                entity_type=command.entity_type,
                entity_id=command.entity_id,
                operation=MutationOperation(command.operation),
                payload=command.payload or None,
                request_hash=request_hash,
                status=MutationStatus.RECEIVED,
                base_row_version=command.base_row_version,
                expires_at=now + timedelta(days=retention_days),
            )
            .on_conflict_do_nothing(index_elements=[SyncMutationModel.mutation_id])
            .returning(SyncMutationModel.mutation_id)
        )
        model = await self._session.get(SyncMutationModel, command.mutation_id)
        if model is None:
            raise RuntimeError("Claimed mutation could not be loaded")
        return self._mutation(model), claimed_id is not None

    async def apply_authoritative(
        self, *, profile_id: UUID, command: MutationCommand
    ) -> AppliedMutation:
        async with self._session.begin_nested():
            return await self._execute_authoritative(profile_id=profile_id, command=command)

    async def _execute_authoritative(
        self, *, profile_id: UUID, command: MutationCommand
    ) -> AppliedMutation:
        if command.entity_type == "progress":
            service = LearningService(lambda: _AmbientLearningUnitOfWork(self._session))
            state = await service.save_progress(
                profile_id=profile_id,
                content_item_id=command.entity_id,
                status=LearningStatus(cast(str, command.payload["status"])),
                confidence=cast(int, command.payload["confidence"]),
                expected_row_version=command.base_row_version or 0,
            )
            return AppliedMutation(
                "progress",
                command.entity_id,
                "upsert",
                state.row_version,
                {
                    "status": state.status.value,
                    "confidence": state.confidence,
                    "row_version": state.row_version,
                },
            )
        if command.entity_type == "bookmark":
            learning = LearningService(lambda: _AmbientLearningUnitOfWork(self._session))
            if command.operation == "delete":
                await learning.remove_bookmark(
                    profile_id=profile_id, content_item_id=command.entity_id
                )
                operation = "delete"
            else:
                await learning.add_bookmark(
                    profile_id=profile_id, content_item_id=command.entity_id
                )
                operation = "upsert"
            return AppliedMutation("bookmark", command.entity_id, operation, None, {})
        if command.entity_type == "note":
            return await self._apply_note(profile_id=profile_id, command=command)
        if command.entity_type == "practice_attempt":
            practice = PracticeAttemptService(
                lambda: _AmbientPracticeUnitOfWork(self._session),
                DeterministicInitialReviewScheduler(),
                None,
            )
            attempt_result = await practice.submit(
                profile_id=profile_id,
                command=SubmitPracticeAttempt(
                    command.entity_id,
                    UUID(cast(str, command.payload["content_item_id"])),
                    (
                        UUID(cast(str, command.payload["practice_resource_id"]))
                        if command.payload.get("practice_resource_id")
                        else None
                    ),
                    cast(str, command.payload["outcome"]),
                    cast(int | None, command.payload.get("duration_seconds")),
                    cast(bool, command.payload["hint_used"]),
                    cast(int | None, command.payload.get("confidence_before")),
                    cast(int | None, command.payload.get("confidence_after")),
                    datetime.fromisoformat(cast(str, command.payload["attempted_at"])),
                ),
            )
            return AppliedMutation(
                "practice_attempt",
                attempt_result.attempt_id,
                "upsert",
                None,
                {
                    "attempt_id": str(attempt_result.attempt_id),
                    "review_card_id": str(attempt_result.review_card_id),
                    "next_review_at": attempt_result.next_review_at.isoformat(),
                },
            )
        if command.entity_type == "review":
            recall = RecallService(
                lambda: _AmbientRecallUnitOfWork(self._session),
                DeterministicReviewScheduler(),
                None,
            )
            review_result = await recall.submit(
                profile_id=profile_id,
                card_id=command.entity_id,
                command=SubmitReview(
                    UUID(cast(str, command.payload["review_event_id"])),
                    cast(str, command.payload["rating"]),
                    cast(int | None, command.payload.get("response_time_ms")),
                    datetime.fromisoformat(cast(str, command.payload["reviewed_at"])),
                    cast(int, command.payload["expected_row_version"]),
                ),
            )
            return AppliedMutation(
                "review",
                command.entity_id,
                "upsert",
                review_result.row_version,
                {
                    "review_history_id": review_result.review_history_id,
                    "next_review_at": review_result.next_review_at.isoformat(),
                    "row_version": review_result.row_version,
                },
                review_result.sync_cursor,
            )
        raise AppError(
            error_type="unsupported-mutation-type",
            title="Unsupported mutation",
            status=422,
            detail="The mutation entity type is not supported",
        )

    async def _apply_note(self, *, profile_id: UUID, command: MutationCommand) -> AppliedMutation:
        learning = LearningService(lambda: _AmbientLearningUnitOfWork(self._session))
        if command.operation == "insert":
            note = await learning.create_note(
                profile_id=profile_id,
                note_id=command.entity_id,
                content_item_id=UUID(cast(str, command.payload["content_item_id"])),
                kind=cast(str, command.payload["kind"]),
                title=cast(str | None, command.payload.get("title")),
                body=cast(str, command.payload["body"]),
            )
            operation = "upsert"
        elif command.operation == "update":
            note = await learning.update_note(
                profile_id=profile_id,
                note_id=command.entity_id,
                kind=cast(str | None, command.payload.get("kind")),
                title=cast(str | None, command.payload.get("title")),
                title_is_set="title" in command.payload,
                body=cast(str | None, command.payload.get("body")),
                expected_row_version=cast(int, command.base_row_version),
            )
            operation = "upsert"
        else:
            await learning.delete_note(
                profile_id=profile_id,
                note_id=command.entity_id,
                expected_row_version=cast(int, command.base_row_version),
            )
            return AppliedMutation(
                "note", command.entity_id, "delete", cast(int, command.base_row_version) + 1, {}
            )
        return AppliedMutation(
            "note",
            note.id,
            operation,
            note.row_version,
            {"row_version": note.row_version},
        )

    async def allocate_user_change(
        self, *, profile_id: UUID, mutation: AppliedMutation, retention_days: int
    ) -> int:
        await self._session.execute(
            insert(UserSyncCounterModel)
            .values(user_id=profile_id, last_cursor=0)
            .on_conflict_do_nothing(index_elements=[UserSyncCounterModel.user_id])
        )
        counter = await self._session.scalar(
            select(UserSyncCounterModel)
            .where(UserSyncCounterModel.user_id == profile_id)
            .with_for_update()
        )
        if counter is None:
            raise RuntimeError("User sync counter could not be created")
        counter.last_cursor += 1
        counter.updated_at = datetime.now(UTC)
        self._session.add(
            UserSyncChangeLogModel(
                user_id=profile_id,
                cursor=counter.last_cursor,
                entity_type=mutation.entity_type,
                entity_id=mutation.entity_id,
                operation=ChangeOperation(mutation.operation),
                entity_version=mutation.resulting_row_version,
                retain_until=datetime.now(UTC) + timedelta(days=retention_days),
            )
        )
        await self._session.flush()
        return counter.last_cursor

    async def mark_mutation_applied(
        self,
        *,
        mutation_id: UUID,
        resulting_row_version: int | None,
        cursor: int,
        result: dict[str, object],
    ) -> None:
        await self._session.execute(
            update(SyncMutationModel)
            .where(SyncMutationModel.mutation_id == mutation_id)
            .values(
                status=MutationStatus.APPLIED,
                resulting_row_version=resulting_row_version,
                result_cursor=cursor,
                result_payload=result,
                processed_at=datetime.now(UTC),
            )
        )

    async def mark_mutation_rejected(self, *, mutation_id: UUID, error_code: str) -> None:
        await self._session.execute(
            update(SyncMutationModel)
            .where(SyncMutationModel.mutation_id == mutation_id)
            .values(
                status=MutationStatus.REJECTED,
                error_code=error_code[:80],
                processed_at=datetime.now(UTC),
            )
        )

    async def mark_mutation_conflict(
        self, *, mutation_id: UUID, error_code: str, conflict: MutationConflict
    ) -> None:
        await self._session.execute(
            update(SyncMutationModel)
            .where(SyncMutationModel.mutation_id == mutation_id)
            .values(
                status=MutationStatus.REJECTED,
                error_code=error_code[:80],
                result_payload={
                    "conflict": {
                        "entity_type": conflict.entity_type,
                        "entity_id": str(conflict.entity_id),
                        "expected_row_version": conflict.expected_row_version,
                        "current_row_version": conflict.current_row_version,
                        "server_entity": conflict.server_entity,
                    }
                },
                processed_at=datetime.now(UTC),
            )
        )

    async def load_conflict(
        self, *, profile_id: UUID, command: MutationCommand, error_code: str
    ) -> MutationConflict | None:
        if "stale" not in error_code and "conflict" not in error_code:
            return None
        expected = command.base_row_version
        if command.entity_type == "review":
            raw_expected = command.payload.get("expected_row_version")
            expected = raw_expected if isinstance(raw_expected, int) else None
        if expected is None:
            return None
        if command.entity_type == "note":
            note = await self._session.scalar(
                select(UserNoteModel).where(
                    UserNoteModel.id == command.entity_id,
                    UserNoteModel.user_id == profile_id,
                    UserNoteModel.deleted_at.is_(None),
                )
            )
            if note is None:
                return None
            entity: dict[str, object] = {
                "id": str(note.id),
                "content_item_id": str(note.content_item_id),
                "kind": note.kind.value,
                "title": note.title,
                "body": note.body,
                "row_version": note.row_version,
                "created_at": note.created_at.isoformat(),
                "updated_at": note.updated_at.isoformat(),
            }
            return MutationConflict("note", note.id, expected, note.row_version, entity)
        if command.entity_type == "progress":
            progress = await self._session.get(UserProgressModel, (profile_id, command.entity_id))
            if progress is None:
                return None
            entity = {
                "content_item_id": str(progress.content_item_id),
                "status": progress.status.value,
                "confidence": progress.confidence,
                "row_version": progress.row_version,
                "updated_at": progress.updated_at.isoformat(),
            }
            return MutationConflict(
                "progress",
                progress.content_item_id,
                expected,
                progress.row_version,
                entity,
            )
        if command.entity_type == "review":
            card = await self._session.scalar(
                select(ReviewCardModel).where(
                    ReviewCardModel.id == command.entity_id,
                    ReviewCardModel.user_id == profile_id,
                    ReviewCardModel.suspended_at.is_(None),
                )
            )
            if card is None:
                return None
            entity = self._review_card_payload(card)
            return MutationConflict("review", card.id, expected, card.row_version, entity)
        return None

    async def mark_device_pushed(self, device_id: UUID) -> None:
        now = datetime.now(UTC)
        await self._session.execute(
            update(DeviceModel).where(DeviceModel.id == device_id).values(last_seen_at=now)
        )
        await self._session.execute(
            update(DeviceUserSyncStateModel)
            .where(DeviceUserSyncStateModel.device_id == device_id)
            .values(last_push_at=now, updated_at=now)
        )

    async def user_changes(
        self, *, profile_id: UUID, device_id: UUID, after: int, limit: int
    ) -> ChangeFeed:
        await self._require_active_device(profile_id, device_id)
        state = await self._session.get(DeviceUserSyncStateModel, device_id)
        if state is None:
            raise RuntimeError("Device user sync state is missing")
        current = int(
            await self._session.scalar(
                select(UserSyncCounterModel.last_cursor).where(
                    UserSyncCounterModel.user_id == profile_id
                )
            )
            or 0
        )
        if after > current:
            raise AppError(
                error_type="user-cursor-ahead",
                title="Invalid user cursor",
                status=422,
                detail="The user cursor is ahead of the server stream",
            )
        earliest = await self._session.scalar(
            select(func.min(UserSyncChangeLogModel.cursor)).where(
                UserSyncChangeLogModel.user_id == profile_id
            )
        )
        if after < current and (earliest is None or after < earliest - 1):
            state.full_resync_required = True
        if state.full_resync_required:
            return ChangeFeed((), after, current, False, True)
        models = (
            await self._session.scalars(
                select(UserSyncChangeLogModel)
                .where(
                    UserSyncChangeLogModel.user_id == profile_id,
                    UserSyncChangeLogModel.cursor > after,
                )
                .order_by(UserSyncChangeLogModel.cursor)
                .limit(limit + 1)
            )
        ).all()
        has_more = len(models) > limit
        selected = models[:limit]
        next_cursor = selected[-1].cursor if selected else after
        now = datetime.now(UTC)
        state.last_user_cursor = max(state.last_user_cursor, next_cursor)
        state.last_pull_at = now
        state.updated_at = now
        await self._session.execute(
            update(DeviceModel).where(DeviceModel.id == device_id).values(last_seen_at=now)
        )
        return ChangeFeed(
            tuple(self._user_change(model) for model in selected),
            after,
            next_cursor,
            has_more,
            False,
        )

    async def catalog_changes(
        self, *, profile_id: UUID, device_id: UUID, domain_id: UUID, after: int, limit: int
    ) -> ChangeFeed:
        await self._require_active_device(profile_id, device_id)
        if await self._session.get(DomainModel, domain_id) is None:
            raise AppError(
                error_type="domain-not-found",
                title="Domain not found",
                status=404,
                detail="The requested catalog domain does not exist",
            )
        await self._session.execute(
            insert(DeviceCatalogSyncStateModel)
            .values(device_id=device_id, domain_id=domain_id)
            .on_conflict_do_nothing(
                index_elements=[
                    DeviceCatalogSyncStateModel.device_id,
                    DeviceCatalogSyncStateModel.domain_id,
                ]
            )
        )
        state = await self._session.get(DeviceCatalogSyncStateModel, (device_id, domain_id))
        if state is None:
            raise RuntimeError("Device catalog sync state could not be created")
        current = int(
            await self._session.scalar(
                select(CatalogSyncCounterModel.last_cursor).where(
                    CatalogSyncCounterModel.domain_id == domain_id
                )
            )
            or 0
        )
        if after > current:
            raise AppError(
                error_type="catalog-cursor-ahead",
                title="Invalid catalog cursor",
                status=422,
                detail="The catalog cursor is ahead of the server stream",
            )
        earliest = await self._session.scalar(
            select(func.min(CatalogSyncChangeLogModel.cursor)).where(
                CatalogSyncChangeLogModel.domain_id == domain_id
            )
        )
        if after < current and (earliest is None or after < earliest - 1):
            state.full_resync_required = True
        if state.full_resync_required:
            return ChangeFeed((), after, current, False, True)
        models = (
            await self._session.scalars(
                select(CatalogSyncChangeLogModel)
                .where(
                    CatalogSyncChangeLogModel.domain_id == domain_id,
                    CatalogSyncChangeLogModel.cursor > after,
                )
                .order_by(CatalogSyncChangeLogModel.cursor)
                .limit(limit + 1)
            )
        ).all()
        has_more = len(models) > limit
        selected = models[:limit]
        next_cursor = selected[-1].cursor if selected else after
        now = datetime.now(UTC)
        state.last_catalog_cursor = max(state.last_catalog_cursor, next_cursor)
        state.last_pull_at = now
        state.updated_at = now
        return ChangeFeed(
            tuple(self._catalog_change(model) for model in selected),
            after,
            next_cursor,
            has_more,
            False,
        )

    async def create_catalog_snapshot(
        self,
        *,
        profile_id: UUID,
        device_id: UUID,
        domain_id: UUID,
        retention_minutes: int,
    ) -> FullResyncSnapshot:
        await self._session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        await self._require_active_device(profile_id, device_id)
        domain = await self._session.get(DomainModel, domain_id)
        if domain is None or not domain.is_active:
            raise AppError(
                error_type="domain-not-found",
                title="Domain not found",
                status=404,
                detail="The requested catalog domain does not exist",
            )
        cursor = int(
            await self._session.scalar(
                select(CatalogSyncCounterModel.last_cursor).where(
                    CatalogSyncCounterModel.domain_id == domain_id
                )
            )
            or 0
        )
        await self._after_snapshot_cursor("catalog")
        categories = (
            await self._session.scalars(
                select(CategoryModel)
                .where(
                    CategoryModel.domain_id == domain_id,
                    CategoryModel.is_active.is_(True),
                )
                .order_by(CategoryModel.sort_order, CategoryModel.id)
            )
        ).all()
        item_rows = (
            await self._session.execute(
                select(ContentItemModel, ContentVersionModel)
                .join(
                    ContentVersionModel,
                    and_(
                        ContentVersionModel.id == ContentItemModel.current_published_version_id,
                        ContentVersionModel.content_item_id == ContentItemModel.id,
                    ),
                )
                .where(
                    ContentItemModel.domain_id == domain_id,
                    ContentItemModel.archived_at.is_(None),
                    ContentVersionModel.status == PublicationStatus.PUBLISHED,
                )
                .order_by(ContentItemModel.id)
            )
        ).all()
        version_ids = [version.id for _, version in item_rows]
        category_rows = (
            await self._session.execute(
                select(
                    ContentVersionCategoryModel.content_version_id,
                    ContentVersionCategoryModel.category_id,
                )
                .where(ContentVersionCategoryModel.content_version_id.in_(version_ids))
                .order_by(
                    ContentVersionCategoryModel.content_version_id,
                    ContentVersionCategoryModel.sort_order,
                    ContentVersionCategoryModel.category_id,
                )
            )
        ).all()
        categories_by_version: dict[UUID, list[str]] = {}
        for version_id, category_id in category_rows:
            categories_by_version.setdefault(version_id, []).append(str(category_id))
        block_rows = (
            await self._session.execute(
                select(
                    ContentVersionBlockModel.content_version_id,
                    ContentVersionBlockModel.position,
                    ContentVersionBlockModel.heading,
                    ContentBlockModel,
                )
                .join(
                    ContentBlockModel,
                    ContentBlockModel.id == ContentVersionBlockModel.content_block_id,
                )
                .where(ContentVersionBlockModel.content_version_id.in_(version_ids))
                .order_by(
                    ContentVersionBlockModel.content_version_id,
                    ContentVersionBlockModel.position,
                )
            )
        ).all()
        blocks_by_version: dict[UUID, list[dict[str, object]]] = {}
        for version_id, position, heading, block in block_rows:
            blocks_by_version.setdefault(version_id, []).append(
                {
                    "id": str(block.id),
                    "position": position,
                    "heading": heading,
                    "type": block.type.value,
                    "payload": block.payload,
                }
            )
        payload: dict[str, object] = {
            "categories": [
                {
                    "id": str(category.id),
                    "domain_id": str(category.domain_id),
                    "parent_category_id": (
                        str(category.parent_category_id) if category.parent_category_id else None
                    ),
                    "slug": category.slug,
                    "name": category.name,
                    "description": category.description,
                    "sort_order": category.sort_order,
                    "updated_at": category.updated_at.isoformat(),
                }
                for category in categories
            ],
            "content_items": [
                {
                    "id": str(item.id),
                    "domain_id": str(item.domain_id),
                    "slug": item.slug,
                    "type": item.type.value,
                    "difficulty": item.difficulty.value if item.difficulty else None,
                    "current_published_version_id": str(version.id),
                    "title": version.title,
                    "summary": version.summary,
                    "row_version": version.row_version,
                    "category_ids": categories_by_version.get(version.id, []),
                    "updated_at": item.updated_at.isoformat(),
                }
                for item, version in item_rows
            ],
            "content_documents": [
                {
                    "id": str(version.id),
                    "content_item_id": str(item.id),
                    "version_number": version.version_number,
                    "published_at": (
                        version.published_at.isoformat() if version.published_at else None
                    ),
                    "blocks": blocks_by_version.get(version.id, []),
                }
                for item, version in item_rows
            ],
        }
        return await self._store_snapshot(
            profile_id=profile_id,
            device_id=device_id,
            stream_type="catalog",
            domain_id=domain_id,
            domain_slug=domain.slug,
            cursor=cursor,
            payload=payload,
            retention_minutes=retention_minutes,
        )

    async def create_user_snapshot(
        self,
        *,
        profile_id: UUID,
        device_id: UUID,
        retention_minutes: int,
    ) -> FullResyncSnapshot:
        await self._session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        await self._require_active_device(profile_id, device_id)
        cursor = int(
            await self._session.scalar(
                select(UserSyncCounterModel.last_cursor).where(
                    UserSyncCounterModel.user_id == profile_id
                )
            )
            or 0
        )
        await self._after_snapshot_cursor("user")
        progress = (
            await self._session.scalars(
                select(UserProgressModel)
                .where(UserProgressModel.user_id == profile_id)
                .order_by(UserProgressModel.content_item_id)
            )
        ).all()
        bookmarks = (
            await self._session.scalars(
                select(BookmarkModel)
                .where(BookmarkModel.user_id == profile_id)
                .order_by(BookmarkModel.content_item_id)
            )
        ).all()
        notes = (
            await self._session.scalars(
                select(UserNoteModel)
                .where(
                    UserNoteModel.user_id == profile_id,
                    UserNoteModel.deleted_at.is_(None),
                )
                .order_by(UserNoteModel.id)
            )
        ).all()
        review_cards = (
            await self._session.scalars(
                select(ReviewCardModel)
                .join(
                    ContentItemModel,
                    ContentItemModel.id == ReviewCardModel.content_item_id,
                )
                .join(
                    ContentVersionModel,
                    and_(
                        ContentVersionModel.id == ContentItemModel.current_published_version_id,
                        ContentVersionModel.content_item_id == ContentItemModel.id,
                    ),
                )
                .where(
                    ReviewCardModel.user_id == profile_id,
                    ReviewCardModel.suspended_at.is_(None),
                    ContentItemModel.archived_at.is_(None),
                    ContentVersionModel.status == PublicationStatus.PUBLISHED,
                )
                .order_by(ReviewCardModel.due_at, ReviewCardModel.id)
            )
        ).all()
        payload: dict[str, object] = {
            "progress": [
                {
                    "content_item_id": str(item.content_item_id),
                    "status": item.status.value,
                    "confidence": item.confidence,
                    "last_opened_at": (
                        item.last_opened_at.isoformat() if item.last_opened_at else None
                    ),
                    "row_version": item.row_version,
                    "updated_at": item.updated_at.isoformat(),
                }
                for item in progress
            ],
            "bookmarks": [
                {
                    "content_item_id": str(item.content_item_id),
                    "created_at": item.created_at.isoformat(),
                }
                for item in bookmarks
            ],
            "notes": [self._note_payload(item) for item in notes],
            "review_cards": [self._review_card_payload(item) for item in review_cards],
        }
        return await self._store_snapshot(
            profile_id=profile_id,
            device_id=device_id,
            stream_type="user",
            domain_id=None,
            domain_slug=None,
            cursor=cursor,
            payload=payload,
            retention_minutes=retention_minutes,
        )

    async def acknowledge_snapshot(
        self,
        *,
        profile_id: UUID,
        device_id: UUID,
        snapshot_id: UUID,
        snapshot_cursor: int,
        stream_type: str,
        domain_id: UUID | None,
    ) -> FullResyncAck:
        await self._require_active_device(profile_id, device_id)
        snapshot = await self._session.scalar(
            select(FullResyncSnapshotModel)
            .where(
                FullResyncSnapshotModel.id == snapshot_id,
                FullResyncSnapshotModel.user_id == profile_id,
                FullResyncSnapshotModel.device_id == device_id,
                FullResyncSnapshotModel.stream_type == stream_type,
                FullResyncSnapshotModel.domain_id == domain_id,
            )
            .with_for_update()
        )
        if snapshot is None:
            raise AppError(
                error_type="full-resync-snapshot-not-found",
                title="Full resync snapshot not found",
                status=404,
                detail="No matching full resync snapshot exists",
            )
        now = datetime.now(UTC)
        if snapshot.expires_at <= now:
            raise AppError(
                error_type="full-resync-snapshot-expired",
                title="Full resync snapshot expired",
                status=410,
                detail="Request a new full resync snapshot",
            )
        if snapshot.snapshot_cursor != snapshot_cursor:
            raise AppError(
                error_type="full-resync-cursor-mismatch",
                title="Full resync cursor mismatch",
                status=409,
                detail="snapshot_cursor does not match the issued snapshot",
            )
        if stream_type == "catalog":
            assert domain_id is not None
            await self._session.execute(
                insert(DeviceCatalogSyncStateModel)
                .values(
                    device_id=device_id,
                    domain_id=domain_id,
                    last_catalog_cursor=snapshot_cursor,
                    full_resync_required=False,
                    last_pull_at=now,
                    updated_at=now,
                )
                .on_conflict_do_update(
                    index_elements=[
                        DeviceCatalogSyncStateModel.device_id,
                        DeviceCatalogSyncStateModel.domain_id,
                    ],
                    set_={
                        "last_catalog_cursor": func.greatest(
                            DeviceCatalogSyncStateModel.last_catalog_cursor,
                            snapshot_cursor,
                        ),
                        "full_resync_required": False,
                        "last_pull_at": now,
                        "updated_at": now,
                    },
                )
            )
        else:
            await self._session.execute(
                update(DeviceUserSyncStateModel)
                .where(DeviceUserSyncStateModel.device_id == device_id)
                .values(
                    last_user_cursor=func.greatest(
                        DeviceUserSyncStateModel.last_user_cursor,
                        snapshot_cursor,
                    ),
                    full_resync_required=False,
                    last_pull_at=now,
                    updated_at=now,
                )
            )
        if snapshot.acknowledged_at is None:
            snapshot.acknowledged_at = now
        return FullResyncAck(True, snapshot.snapshot_cursor)

    async def _store_snapshot(
        self,
        *,
        profile_id: UUID,
        device_id: UUID,
        stream_type: str,
        domain_id: UUID | None,
        domain_slug: str | None,
        cursor: int,
        payload: dict[str, object],
        retention_minutes: int,
    ) -> FullResyncSnapshot:
        generated_at = datetime.now(UTC)
        expires_at = generated_at + timedelta(minutes=retention_minutes)
        model = FullResyncSnapshotModel(
            user_id=profile_id,
            device_id=device_id,
            stream_type=stream_type,
            domain_id=domain_id,
            snapshot_cursor=cursor,
            payload=payload,
            expires_at=expires_at,
        )
        self._session.add(model)
        await self._session.flush()
        return FullResyncSnapshot(
            model.id,
            stream_type,
            domain_id,
            domain_slug,
            cursor,
            generated_at,
            expires_at,
            payload,
        )

    async def _after_snapshot_cursor(self, stream_type: str) -> None:
        """Test seam invoked after PostgreSQL establishes the MVCC snapshot."""

    async def compact(self, *, now: datetime) -> CompactionResult:
        user_expired = (
            await self._session.execute(
                select(
                    UserSyncChangeLogModel.user_id,
                    func.max(UserSyncChangeLogModel.cursor),
                )
                .where(UserSyncChangeLogModel.retain_until <= now)
                .group_by(UserSyncChangeLogModel.user_id)
            )
        ).all()
        catalog_expired = (
            await self._session.execute(
                select(
                    CatalogSyncChangeLogModel.domain_id,
                    func.max(CatalogSyncChangeLogModel.cursor),
                )
                .where(CatalogSyncChangeLogModel.retain_until <= now)
                .group_by(CatalogSyncChangeLogModel.domain_id)
            )
        ).all()
        user_marked = 0
        for user_id, cursor in user_expired:
            result = await self._session.execute(
                update(DeviceUserSyncStateModel)
                .where(
                    DeviceUserSyncStateModel.device_id.in_(
                        select(DeviceModel.id).where(DeviceModel.user_id == user_id)
                    ),
                    DeviceUserSyncStateModel.last_user_cursor < cursor,
                )
                .values(full_resync_required=True, updated_at=now)
            )
            user_marked += cast(CursorResult[Any], result).rowcount
        catalog_marked = 0
        for domain_id, cursor in catalog_expired:
            result = await self._session.execute(
                update(DeviceCatalogSyncStateModel)
                .where(
                    DeviceCatalogSyncStateModel.domain_id == domain_id,
                    DeviceCatalogSyncStateModel.last_catalog_cursor < cursor,
                )
                .values(full_resync_required=True, updated_at=now)
            )
            catalog_marked += cast(CursorResult[Any], result).rowcount
        mutation_result = await self._session.execute(
            delete(SyncMutationModel).where(SyncMutationModel.expires_at <= now)
        )
        user_result = await self._session.execute(
            delete(UserSyncChangeLogModel).where(UserSyncChangeLogModel.retain_until <= now)
        )
        catalog_result = await self._session.execute(
            delete(CatalogSyncChangeLogModel).where(CatalogSyncChangeLogModel.retain_until <= now)
        )
        return CompactionResult(
            cast(CursorResult[Any], mutation_result).rowcount,
            cast(CursorResult[Any], user_result).rowcount,
            cast(CursorResult[Any], catalog_result).rowcount,
            user_marked,
            catalog_marked,
        )

    async def _require_active_device(self, profile_id: UUID, device_id: UUID) -> None:
        if not await self.active_device_owned_by(profile_id=profile_id, device_id=device_id):
            raise AppError(
                error_type="device-not-found",
                title="Device not found",
                status=404,
                detail="No active device exists for the authenticated user",
            )

    @staticmethod
    def _device(model: DeviceModel) -> Device:
        return Device(
            model.id,
            model.device_name,
            model.platform,
            model.app_version,
            model.last_seen_at,
            model.registered_at,
            model.revoked_at,
        )

    @staticmethod
    def _mutation(model: SyncMutationModel) -> MutationRecord:
        return MutationRecord(
            model.mutation_id,
            model.request_hash,
            model.status.value,
            model.entity_type,
            model.entity_id,
            model.operation.value,
            model.resulting_row_version,
            model.result_cursor,
            model.result_payload,
            model.error_code,
        )

    @staticmethod
    def _user_change(model: UserSyncChangeLogModel) -> Change:
        return Change(
            model.cursor,
            model.entity_type,
            model.entity_id,
            model.operation.value,
            model.entity_version,
            model.changed_at,
        )

    @staticmethod
    def _catalog_change(model: CatalogSyncChangeLogModel) -> Change:
        return Change(
            model.cursor,
            model.entity_type,
            model.entity_id,
            model.operation.value,
            model.entity_version,
            model.changed_at,
        )

    @staticmethod
    def _note_payload(note: UserNoteModel) -> dict[str, object]:
        return {
            "id": str(note.id),
            "content_item_id": str(note.content_item_id),
            "kind": note.kind.value,
            "title": note.title,
            "body": note.body,
            "row_version": note.row_version,
            "created_at": note.created_at.isoformat(),
            "updated_at": note.updated_at.isoformat(),
        }

    @staticmethod
    def _review_card_payload(card: ReviewCardModel) -> dict[str, object]:
        return {
            "id": str(card.id),
            "content_item_id": str(card.content_item_id),
            "state": "scheduled",
            "next_review_at": card.due_at.isoformat(),
            "row_version": card.row_version,
            "created_at": card.created_at.isoformat(),
            "updated_at": card.updated_at.isoformat(),
        }


class SqlAlchemySyncUnitOfWork(SyncUnitOfWork):
    def __init__(self, session_factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self.repository: SyncRepository

    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        self.repository = SqlAlchemySyncRepository(self._session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._session is None:
            return
        if exc_type is not None:
            await self._session.rollback()
        await self._session.close()

    async def commit(self) -> None:
        if self._session is None:
            raise RuntimeError("Unit of work has not been entered")
        await self._session.commit()
