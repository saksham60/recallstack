"""Durable, cross-instance cooldown for user-requested refreshes."""

from datetime import datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.knowledge.application.refresh import RefreshRun, RefreshStatus
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import RefreshRunModel
from recallstack.shared.database import DatabaseSessionFactory

_START_LOCK = 723104692116
_MAX_ACTIVE_AGE = timedelta(hours=2)


def _to_run(row: RefreshRunModel) -> RefreshRun:
    return RefreshRun(
        row.id,
        row.requested_at,
        cast(RefreshStatus, row.status),
        row.operation_name,
        row.checked_at,
    )


class SqlAlchemyRefreshStore:
    def __init__(self, factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._factory = factory

    async def reserve(
        self, profile_id: UUID, now: datetime, cooldown: timedelta
    ) -> tuple[RefreshRun, bool]:
        async with self._factory.create_session() as session, session.begin():
            await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _START_LOCK})
            latest = await session.scalar(
                select(RefreshRunModel).order_by(RefreshRunModel.requested_at.desc()).limit(1)
            )
            if latest and (
                now - latest.requested_at < cooldown
                or (
                    latest.status in {"starting", "running"}
                    and now - latest.requested_at < _MAX_ACTIVE_AGE
                )
            ):
                return _to_run(latest), False
            row = RefreshRunModel(
                id=uuid4(), requested_by=profile_id, requested_at=now, status="starting"
            )
            session.add(row)
            return _to_run(row), True

    async def get(self, run_id: UUID) -> RefreshRun | None:
        async with self._factory.create_session() as session:
            row = await session.get(RefreshRunModel, run_id)
            return _to_run(row) if row else None

    async def update(
        self,
        run_id: UUID,
        status: RefreshStatus,
        *,
        operation_name: str | None = None,
        checked_at: datetime | None = None,
    ) -> RefreshRun:
        async with self._factory.create_session() as session, session.begin():
            row = await session.scalar(
                select(RefreshRunModel).where(RefreshRunModel.id == run_id).with_for_update()
            )
            if row is None:
                raise RuntimeError("Refresh reservation disappeared")
            if row.status not in {"succeeded", "failed"}:
                row.status = status
                if operation_name is not None:
                    row.operation_name = operation_name
                if checked_at is not None:
                    row.checked_at = checked_at
            return _to_run(row)
