"""Start one shared Knowledge refresh and report its progress."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal, Protocol
from uuid import UUID

from recallstack.shared.errors import AppError

logger = logging.getLogger(__name__)
RefreshStatus = Literal["starting", "running", "succeeded", "failed"]


@dataclass(frozen=True, slots=True)
class RefreshRun:
    id: UUID
    requested_at: datetime
    status: RefreshStatus
    operation_name: str | None = None
    checked_at: datetime | None = None


class RefreshStore(Protocol):
    async def reserve(
        self, profile_id: UUID, now: datetime, cooldown: timedelta
    ) -> tuple[RefreshRun, bool]: ...

    async def get(self, run_id: UUID) -> RefreshRun | None: ...

    async def update(
        self,
        run_id: UUID,
        status: RefreshStatus,
        *,
        operation_name: str | None = None,
        checked_at: datetime | None = None,
    ) -> RefreshRun: ...


class RefreshRunner(Protocol):
    async def start(self) -> str: ...

    async def status(self, operation_name: str) -> RefreshStatus: ...


class RefreshService:
    def __init__(self, store: RefreshStore, runner: RefreshRunner, cooldown_minutes: int) -> None:
        self._store = store
        self._runner = runner
        self.cooldown = timedelta(minutes=cooldown_minutes)

    async def start(self, profile_id: UUID) -> RefreshRun:
        run, created = await self._store.reserve(profile_id, datetime.now(UTC), self.cooldown)
        if not created:
            return run
        try:
            operation_name = await self._runner.start()
        except Exception as exc:
            logger.warning("knowledge_refresh_start_failed", extra={"failure": type(exc).__name__})
            await self._store.update(run.id, "failed")
            raise AppError(
                error_type="knowledge-refresh-unavailable",
                title="Refresh unavailable",
                status=503,
                detail="New stories could not be requested right now",
            ) from None
        return await self._store.update(run.id, "running", operation_name=operation_name)

    async def status(self, run_id: UUID) -> RefreshRun:
        run = await self._store.get(run_id)
        if run is None:
            raise AppError(
                error_type="knowledge-refresh-not-found",
                title="Refresh not found",
                status=404,
                detail="This refresh is unavailable",
            )
        now = datetime.now(UTC)
        if run.status == "starting" and now - run.requested_at > timedelta(minutes=2):
            return await self._store.update(run.id, "failed")
        if run.status != "running" or not run.operation_name:
            return run
        if run.checked_at and now - run.checked_at < timedelta(seconds=8):
            return run
        try:
            status = await self._runner.status(run.operation_name)
        except Exception as exc:
            logger.warning("knowledge_refresh_status_failed", extra={"failure": type(exc).__name__})
            return run
        return await self._store.update(run.id, status, checked_at=now)
