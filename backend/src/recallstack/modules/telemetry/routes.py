import json
import logging
from collections.abc import Awaitable, Callable
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import text

from recallstack.modules.admin.infrastructure.analytics_repository import (
    SqlAlchemyAdminAnalyticsRepository,
)
from recallstack.modules.admin.presentation.analytics_routes import GrowthDays, _audit
from recallstack.modules.identity.presentation.dependencies import (
    AdminUserDependency,
    CurrentUserDependency,
)
from recallstack.modules.telemetry.contract import (
    Batch,
    ClassificationRequest,
    Intelligence,
    IntelligenceUsers,
    Receipt,
    Timeline,
)
from recallstack.modules.telemetry.ingestion import ingest
from recallstack.modules.telemetry.repository import IntelligenceRepository

logger = logging.getLogger(__name__)
router = APIRouter(tags=["product-intelligence-v2"])
Days = Annotated[GrowthDays, Query()]


async def read[T](
    request: Request,
    admin: UUID,
    operation: Callable[[IntelligenceRepository], Awaitable[T]],
    action: str = "admin.intelligence.viewed",
) -> T:
    session = request.app.state.telemetry_session_factory.create_session()
    try:
        await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        result = await operation(IntelligenceRepository(session))
        values = _audit(request, admin, action, "telemetry")
        values.pop("metadata")
        values["metadata_json"] = json.dumps({})
        await SqlAlchemyAdminAnalyticsRepository(session).add_audit(values)
        await session.commit()
        return result
    finally:
        await session.close()


@router.post("/telemetry/events", response_model=Receipt, operation_id="collectProductEvents")
async def collect(request: Request, user: CurrentUserDependency, batch: Batch) -> Receipt:
    session = request.app.state.telemetry_session_factory.create_session()
    try:
        result = await ingest(
            session, batch, user.profile_id, request.app.state.telemetry_environment
        )
        await session.commit()
        return result
    finally:
        await session.close()


@router.get(
    "/admin/analytics/overview",
    response_model=Intelligence,
    operation_id="productIntelligenceOverview",
)
@router.get(
    "/admin/analytics/features",
    response_model=Intelligence,
    operation_id="productIntelligenceFeatures",
)
async def overview(
    request: Request,
    admin: AdminUserDependency,
    days: Days = GrowthDays.MONTH,
    exclude_internal: bool = False,
) -> Intelligence:
    return await read(
        request, admin.profile_id, lambda r: r.overview(int(days), None, exclude_internal)
    )


@router.get(
    "/admin/users/{user_id}/features",
    response_model=Intelligence,
    operation_id="userIntelligenceFeatures",
)
async def features(
    request: Request, admin: AdminUserDependency, user_id: UUID, days: Days = GrowthDays.MONTH
) -> Intelligence:
    return await read(request, admin.profile_id, lambda r: r.overview(int(days), user_id, False))


@router.get(
    "/admin/users/{user_id}/telemetry",
    response_model=Timeline,
    operation_id="userIntelligenceTimeline",
)
async def timeline(
    request: Request,
    admin: AdminUserDependency,
    user_id: UUID,
    days: Days = GrowthDays.MONTH,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> Timeline:
    return await read(
        request, admin.profile_id, lambda r: r.timeline(user_id, int(days), limit, cursor)
    )


@router.get("/admin/users/{user_id}/sessions", operation_id="userIntelligenceSessions")
async def sessions(
    request: Request,
    admin: AdminUserDependency,
    user_id: UUID,
    days: Days = GrowthDays.MONTH,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
) -> dict[str, Any]:
    return await read(
        request, admin.profile_id, lambda r: r.sessions(user_id, int(days), limit, offset)
    )


@router.get("/admin/analytics/health", operation_id="productIntelligenceHealth")
async def health(
    request: Request, admin: AdminUserDependency, days: Days = GrowthDays.MONTH
) -> dict[str, Any]:
    return await read(request, admin.profile_id, lambda r: r.health(int(days)))


@router.get(
    "/admin/analytics/users",
    response_model=IntelligenceUsers,
    operation_id="productIntelligenceUsers",
)
async def users(
    request: Request,
    admin: AdminUserDependency,
    days: Days = GrowthDays.MONTH,
    search: Annotated[str, Query(max_length=320)] = "",
    segment: Annotated[
        str,
        Query(
            pattern="^(all|new|active|engaged|returning|unobserved|dsa|feed|ai|system_design|mobile|internal)$"
        ),
    ] = "all",
    exclude_internal: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
) -> dict[str, Any]:
    return await read(
        request,
        admin.profile_id,
        lambda r: r.users(int(days), search, segment, exclude_internal, limit, offset),
    )


@router.get("/admin/analytics/funnels", operation_id="productIntelligenceFunnels")
async def funnels(
    request: Request,
    admin: AdminUserDependency,
    days: Days = GrowthDays.MONTH,
    exclude_internal: bool = False,
) -> dict[str, Any]:
    return await read(
        request, admin.profile_id, lambda r: r.funnels(int(days), exclude=exclude_internal)
    )


@router.get("/admin/analytics/cohorts", operation_id="productIntelligenceCohorts")
async def cohorts(
    request: Request,
    admin: AdminUserDependency,
    days: Days = GrowthDays.MONTH,
    exclude_internal: bool = False,
) -> dict[str, Any]:
    return await read(
        request, admin.profile_id, lambda r: r.cohorts(int(days), exclude=exclude_internal)
    )


@router.put(
    "/admin/analytics/users/{user_id}/classification", operation_id="classifyIntelligenceAccount"
)
async def classify(
    request: Request, admin: AdminUserDependency, user_id: UUID, body: ClassificationRequest
) -> dict[str, str | None]:
    return await read(
        request,
        admin.profile_id,
        lambda r: r.classify(user_id, admin.profile_id, body.classification, body.reason),
        action="admin.intelligence.classification_changed",
    )
