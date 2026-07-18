from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Any, Self, cast
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.catalog.infrastructure.sqlalchemy_models import DomainModel
from recallstack.modules.learning.application.learning_state import (
    LearningService,
    LearningStateRepository,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.learning_state_repository import (
    SqlAlchemyLearningStateRepository,
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
from recallstack.modules.sync.application.sync_service import (
    AppliedMutation,
    Change,
    ChangeFeed,
    CompactionResult,
    Device,
    MutationCommand,
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
        self, *, mutation_id: UUID, resulting_row_version: int | None
    ) -> None:
        await self._session.execute(
            update(SyncMutationModel)
            .where(SyncMutationModel.mutation_id == mutation_id)
            .values(
                status=MutationStatus.APPLIED,
                resulting_row_version=resulting_row_version,
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
