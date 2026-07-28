import json
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any
from uuid import UUID

from recallstack.modules.admin.infrastructure.analytics_repository import (
    SqlAlchemyAdminAnalyticsRepository,
)
from recallstack.shared.database import DatabaseSessionFactory
from recallstack.shared.errors import AppError

logger = logging.getLogger(__name__)


class AdminAnalyticsService:
    def __init__(self, session_factory: DatabaseSessionFactory[Any]) -> None:
        self._session_factory = session_factory

    @staticmethod
    def validate_range(start: datetime | None, end: datetime | None) -> None:
        if start is not None and end is not None and start > end:
            raise AppError(
                error_type="invalid-date-range",
                title="Invalid date range",
                status=422,
                detail="The start of a date range must be earlier than or equal to its end",
            )

    async def _run[T](
        self,
        operation: Callable[[SqlAlchemyAdminAnalyticsRepository], Awaitable[T]],
        *,
        audit: dict[str, Any],
    ) -> T:
        session = self._session_factory.create_session()
        repository = SqlAlchemyAdminAnalyticsRepository(session)
        try:
            result = await operation(repository)
            try:
                audit_values = dict(audit)
                metadata = audit_values.pop("metadata", {})
                audit_values["metadata_json"] = json.dumps(metadata, separators=(",", ":"))
                await repository.add_audit(audit_values)
                await session.commit()
            except Exception:
                await session.rollback()
                logger.warning(
                    "admin_audit_write_failed",
                    exc_info=True,
                    extra={"action": audit.get("action"), "request_id": audit.get("request_id")},
                )
            return result
        finally:
            await session.close()

    async def overview(self, *, audit: dict[str, Any]) -> dict[str, Any]:
        return await self._run(lambda repository: repository.overview(), audit=audit)

    async def list_users(
        self,
        *,
        filters: dict[str, Any],
        page: int,
        page_size: int,
        sort_by: str,
        descending: bool,
        audit: dict[str, Any],
    ) -> tuple[int, list[dict[str, Any]]]:
        self.validate_range(filters.get("signed_up_from"), filters.get("signed_up_to"))
        self.validate_range(filters.get("active_from"), filters.get("active_to"))
        return await self._run(
            lambda repository: repository.list_users(
                filters=filters,
                offset=(page - 1) * page_size,
                limit=page_size,
                sort_by=sort_by,
                descending=descending,
            ),
            audit=audit,
        )

    async def user_detail(self, user_id: UUID, *, audit: dict[str, Any]) -> dict[str, Any]:
        result = await self._run(lambda repository: repository.user_detail(user_id), audit=audit)
        if result is None:
            self._not_found("user")
        assert result is not None
        return result

    async def activity(
        self,
        user_id: UUID,
        *,
        activity_type: str | None,
        from_date: datetime | None,
        to_date: datetime | None,
        page: int,
        page_size: int,
        audit: dict[str, Any],
    ) -> tuple[int, list[dict[str, Any]]]:
        self.validate_range(from_date, to_date)
        result = await self._run(
            lambda repository: repository.activity(
                user_id,
                activity_type=activity_type,
                from_date=from_date,
                to_date=to_date,
                offset=(page - 1) * page_size,
                limit=page_size,
            ),
            audit=audit,
        )
        if result is None:
            self._not_found("user")
        assert result is not None
        return result

    async def list_problems(
        self,
        *,
        filters: dict[str, Any],
        page: int,
        page_size: int,
        sort_by: str,
        descending: bool,
        audit: dict[str, Any],
    ) -> tuple[int, list[dict[str, Any]]]:
        return await self._run(
            lambda repository: repository.list_problems(
                filters=filters,
                offset=(page - 1) * page_size,
                limit=page_size,
                sort_by=sort_by,
                descending=descending,
            ),
            audit=audit,
        )

    async def problem_detail(self, problem_id: UUID, *, audit: dict[str, Any]) -> dict[str, Any]:
        result = await self._run(
            lambda repository: repository.problem_detail(problem_id), audit=audit
        )
        if result is None:
            self._not_found("problem")
        assert result is not None
        return result

    async def audit_logs(
        self, *, filters: dict[str, Any], page: int, page_size: int, audit: dict[str, Any]
    ) -> tuple[int, list[dict[str, Any]]]:
        self.validate_range(filters.get("from_date"), filters.get("to_date"))
        return await self._run(
            lambda repository: repository.audit_logs(
                filters=filters, offset=(page - 1) * page_size, limit=page_size
            ),
            audit=audit,
        )

    @staticmethod
    def _not_found(resource: str) -> None:
        raise AppError(
            error_type=f"{resource}-not-found",
            title=f"{resource.title()} not found",
            status=404,
            detail=f"The requested {resource} was not found",
        )
