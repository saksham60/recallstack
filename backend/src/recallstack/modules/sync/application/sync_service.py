import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from recallstack.shared.errors import AppError


@dataclass(frozen=True, slots=True)
class Device:
    id: UUID
    device_name: str | None
    platform: str
    app_version: str | None
    last_seen_at: datetime | None
    registered_at: datetime
    revoked_at: datetime | None


@dataclass(frozen=True, slots=True)
class DevicePage:
    items: tuple[Device, ...]
    page: int
    page_size: int
    total_items: int


@dataclass(frozen=True, slots=True)
class MutationCommand:
    mutation_id: UUID
    device_id: UUID
    entity_type: str
    entity_id: UUID
    operation: str
    base_row_version: int | None
    payload: dict[str, object]


@dataclass(frozen=True, slots=True)
class MutationRecord:
    mutation_id: UUID
    request_hash: str
    status: str
    entity_type: str
    entity_id: UUID
    operation: str
    resulting_row_version: int | None
    result_cursor: int | None
    result_payload: dict[str, object] | None
    error_code: str | None


@dataclass(frozen=True, slots=True)
class AppliedMutation:
    entity_type: str
    entity_id: UUID
    operation: str
    resulting_row_version: int | None
    result: dict[str, object]


@dataclass(frozen=True, slots=True)
class MutationResult:
    mutation_id: UUID
    status: str
    deduplicated: bool
    cursor: int | None
    entity_type: str
    entity_id: UUID
    operation: str
    resulting_row_version: int | None
    error_code: str | None
    result: dict[str, object] | None


@dataclass(frozen=True, slots=True)
class Change:
    cursor: int
    entity_type: str
    entity_id: UUID
    operation: str
    entity_version: int | None
    changed_at: datetime


@dataclass(frozen=True, slots=True)
class ChangeFeed:
    changes: tuple[Change, ...]
    after: int
    next_cursor: int
    has_more: bool
    full_resync_required: bool


@dataclass(frozen=True, slots=True)
class CompactionResult:
    mutations_deleted: int
    user_changes_deleted: int
    catalog_changes_deleted: int
    user_devices_marked_for_resync: int
    catalog_devices_marked_for_resync: int


class SyncRepository(Protocol):
    async def register_device(
        self, *, profile_id: UUID, device_name: str | None, platform: str, app_version: str | None
    ) -> Device: ...

    async def list_devices(
        self, *, profile_id: UUID, offset: int, limit: int
    ) -> tuple[int, tuple[Device, ...]]: ...

    async def revoke_device(self, *, profile_id: UUID, device_id: UUID) -> Device | None: ...
    async def active_device_owned_by(self, *, profile_id: UUID, device_id: UUID) -> bool: ...

    async def claim_mutation(
        self,
        *,
        profile_id: UUID,
        command: MutationCommand,
        request_hash: str,
        retention_days: int,
    ) -> tuple[MutationRecord, bool]: ...

    async def apply_authoritative(
        self, *, profile_id: UUID, command: MutationCommand
    ) -> AppliedMutation: ...

    async def allocate_user_change(
        self, *, profile_id: UUID, mutation: AppliedMutation, retention_days: int
    ) -> int: ...

    async def mark_mutation_applied(
        self,
        *,
        mutation_id: UUID,
        resulting_row_version: int | None,
        cursor: int,
        result: dict[str, object],
    ) -> None: ...

    async def mark_mutation_rejected(self, *, mutation_id: UUID, error_code: str) -> None: ...
    async def mark_device_pushed(self, device_id: UUID) -> None: ...

    async def user_changes(
        self, *, profile_id: UUID, device_id: UUID, after: int, limit: int
    ) -> ChangeFeed: ...

    async def catalog_changes(
        self, *, profile_id: UUID, device_id: UUID, domain_id: UUID, after: int, limit: int
    ) -> ChangeFeed: ...

    async def compact(self, *, now: datetime) -> CompactionResult: ...


class SyncUnitOfWork(Protocol):
    repository: SyncRepository

    async def __aenter__(self) -> Self: ...
    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...
    async def commit(self) -> None: ...


SyncUnitOfWorkFactory = Callable[[], SyncUnitOfWork]


class SyncService:
    def __init__(self, uow_factory: SyncUnitOfWorkFactory, *, retention_days: int) -> None:
        self._uow_factory = uow_factory
        self._retention_days = retention_days

    async def register_device(
        self, *, profile_id: UUID, device_name: str | None, platform: str, app_version: str | None
    ) -> Device:
        async with self._uow_factory() as uow:
            device = await uow.repository.register_device(
                profile_id=profile_id,
                device_name=device_name,
                platform=platform,
                app_version=app_version,
            )
            await uow.commit()
        return device

    async def list_devices(self, *, profile_id: UUID, page: int, page_size: int) -> DevicePage:
        async with self._uow_factory() as uow:
            total, devices = await uow.repository.list_devices(
                profile_id=profile_id, offset=(page - 1) * page_size, limit=page_size
            )
        return DevicePage(devices, page, page_size, total)

    async def revoke_device(self, *, profile_id: UUID, device_id: UUID) -> Device:
        async with self._uow_factory() as uow:
            device = await uow.repository.revoke_device(profile_id=profile_id, device_id=device_id)
            if device is None:
                self._device_not_found()
            await uow.commit()
        assert device is not None
        return device

    async def process_mutation(
        self, *, profile_id: UUID, command: MutationCommand, reject_as_error: bool = True
    ) -> MutationResult:
        request_hash = self._request_hash(command)
        rejection: AppError | None = None
        async with self._uow_factory() as uow:
            if not await uow.repository.active_device_owned_by(
                profile_id=profile_id, device_id=command.device_id
            ):
                self._device_not_found()
            record, claimed = await uow.repository.claim_mutation(
                profile_id=profile_id,
                command=command,
                request_hash=request_hash,
                retention_days=self._retention_days,
            )
            if record.request_hash != request_hash:
                raise AppError(
                    error_type="mutation-id-conflict",
                    title="Mutation ID conflict",
                    status=409,
                    detail="mutation_id has already been used with different content",
                )
            if not claimed:
                result = self._deduplicated(record)
            else:
                try:
                    applied = await uow.repository.apply_authoritative(
                        profile_id=profile_id, command=command
                    )
                except AppError as exc:
                    rejection = exc
                    await uow.repository.mark_mutation_rejected(
                        mutation_id=command.mutation_id, error_code=exc.error_type
                    )
                    result = MutationResult(
                        command.mutation_id,
                        "rejected",
                        False,
                        None,
                        command.entity_type,
                        command.entity_id,
                        command.operation,
                        None,
                        exc.error_type,
                        None,
                    )
                else:
                    cursor = await uow.repository.allocate_user_change(
                        profile_id=profile_id,
                        mutation=applied,
                        retention_days=self._retention_days,
                    )
                    await uow.repository.mark_mutation_applied(
                        mutation_id=command.mutation_id,
                        resulting_row_version=applied.resulting_row_version,
                        cursor=cursor,
                        result=applied.result,
                    )
                    await uow.repository.mark_device_pushed(command.device_id)
                    result = MutationResult(
                        command.mutation_id,
                        "applied",
                        False,
                        cursor,
                        applied.entity_type,
                        applied.entity_id,
                        applied.operation,
                        applied.resulting_row_version,
                        None,
                        applied.result,
                    )
            await uow.commit()
        if result.status == "rejected" and reject_as_error:
            if rejection is not None:
                raise rejection
            raise AppError(
                error_type=result.error_code or "mutation-rejected",
                title="Mutation rejected",
                status=self._rejection_status(result.error_code),
                detail="The previously processed mutation was rejected",
            )
        return result

    async def process_batch(
        self, *, profile_id: UUID, commands: tuple[MutationCommand, ...]
    ) -> tuple[MutationResult, ...]:
        results: list[MutationResult] = []
        for command in commands:
            results.append(
                await self.process_mutation(
                    profile_id=profile_id, command=command, reject_as_error=False
                )
            )
        return tuple(results)

    async def user_changes(
        self, *, profile_id: UUID, device_id: UUID, after: int, limit: int
    ) -> ChangeFeed:
        async with self._uow_factory() as uow:
            feed = await uow.repository.user_changes(
                profile_id=profile_id, device_id=device_id, after=after, limit=limit
            )
            await uow.commit()
        return feed

    async def catalog_changes(
        self,
        *,
        profile_id: UUID,
        device_id: UUID,
        domain_id: UUID,
        after: int,
        limit: int,
    ) -> ChangeFeed:
        async with self._uow_factory() as uow:
            feed = await uow.repository.catalog_changes(
                profile_id=profile_id,
                device_id=device_id,
                domain_id=domain_id,
                after=after,
                limit=limit,
            )
            await uow.commit()
        return feed

    async def compact(self, *, now: datetime) -> CompactionResult:
        async with self._uow_factory() as uow:
            result = await uow.repository.compact(now=now)
            await uow.commit()
        return result

    @staticmethod
    def _request_hash(command: MutationCommand) -> str:
        canonical = json.dumps(
            {
                "device_id": str(command.device_id),
                "entity_type": command.entity_type,
                "entity_id": str(command.entity_id),
                "operation": command.operation,
                "base_row_version": command.base_row_version,
                "payload": command.payload,
            },
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    @staticmethod
    def _deduplicated(record: MutationRecord) -> MutationResult:
        return MutationResult(
            record.mutation_id,
            record.status,
            True,
            record.result_cursor,
            record.entity_type,
            record.entity_id,
            record.operation,
            record.resulting_row_version,
            record.error_code,
            record.result_payload,
        )

    @staticmethod
    def _rejection_status(error_code: str | None) -> int:
        return 409 if error_code and ("stale" in error_code or "conflict" in error_code) else 422

    @staticmethod
    def _device_not_found() -> None:
        raise AppError(
            error_type="device-not-found",
            title="Device not found",
            status=404,
            detail="No active device exists for the authenticated user",
        )
