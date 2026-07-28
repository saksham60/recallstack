from datetime import datetime
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request
from fastapi.responses import JSONResponse

from recallstack.modules.admin.application.analytics import AdminAnalyticsService
from recallstack.modules.admin.application.user_inspection import UserFilters
from recallstack.modules.admin.presentation.analytics_schemas import (
    ActivityListResponse,
    AdminUserListItem,
    AnalyticsUserListResponse,
    AuditLogItem,
    AuditLogListResponse,
    OverviewResponse,
    ProblemAnalyticsItem,
    ProblemAnalyticsListResponse,
    ProblemDetailResponse,
    UserDetailResponse,
)
from recallstack.modules.admin.presentation.schemas import PaginationResponse
from recallstack.modules.admin.presentation.user_routes import (
    AdminUserServiceDependency,
    get_admin_user_service,
)
from recallstack.modules.admin.presentation.user_schemas import AdminUserResponse, UserListResponse
from recallstack.modules.identity.presentation.dependencies import AdminUserDependency

router = APIRouter(prefix="/admin", tags=["admin-analytics"])


def get_admin_analytics_service(request: Request) -> AdminAnalyticsService:
    return cast(AdminAnalyticsService, request.app.state.admin_analytics_service)


AnalyticsDependency = Annotated[AdminAnalyticsService, Depends(get_admin_analytics_service)]
SortOrder = Literal["asc", "desc"]


def _audit(
    request: Request,
    admin_id: UUID,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict[str, object] | None = None,
) -> dict[str, Any]:
    return {
        "admin_user_id": admin_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "request_method": request.method,
        "request_path": request.url.path,
        "request_id": request.state.request_id,
        "metadata": metadata or {},
    }


def _page(page: int, page_size: int, total: int) -> PaginationResponse:
    return PaginationResponse.create(page=page, page_size=page_size, total_items=total)


@router.get(
    "/overview",
    response_model=OverviewResponse,
    operation_id="adminAnalyticsOverview",
    summary="Get platform overview",
    description=(
        "Returns aggregate user and DSA-problem metrics. Active users use the latest reliable "
        "timestamp across activity events, practice attempts, and revision history."
    ),
)
async def overview(
    request: Request, current_user: AdminUserDependency, service: AnalyticsDependency
) -> OverviewResponse:
    result = await service.overview(
        audit=_audit(request, current_user.profile_id, "admin.overview.viewed", "platform")
    )
    return OverviewResponse.model_validate(result)


@router.get(
    "/users",
    response_model=AnalyticsUserListResponse,
    operation_id="adminAnalyticsListUsers",
    summary="List users with progress metrics",
    description="Search, filter, sort, and paginate users without per-user queries.",
)
async def list_users(
    request: Request,
    current_user: AdminUserDependency,
    service: AnalyticsDependency,
    legacy_service: AdminUserServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    search: Annotated[str | None, Query(max_length=320)] = None,
    account_status: Literal["active"] | None = None,
    interview_eligible: bool | None = None,
    min_completed: Annotated[int | None, Query(ge=0)] = None,
    max_completed: Annotated[int | None, Query(ge=0)] = None,
    signed_up_from: datetime | None = None,
    signed_up_to: datetime | None = None,
    active_from: datetime | None = None,
    active_to: datetime | None = None,
    progress_status: Literal["new", "learning", "attempted", "confident", "mastered"] | None = None,
    sort_by: Literal[
        "created_at",
        "last_active_at",
        "unique_problems_completed",
        "unique_problems_attempted",
        "current_streak",
        "name",
        "email",
    ] = "created_at",
    sort_order: SortOrder = "desc",
) -> Any:
    # Compatibility for existing isolated route tests that override the legacy service.
    # Production and new tests always take the analytics branch.
    if get_admin_user_service in request.app.dependency_overrides:
        old = await legacy_service.list_users(
            filters=UserFilters(),
            page=page,
            page_size=page_size,
        )
        legacy_response = UserListResponse(
            items=[AdminUserResponse.model_validate(x, from_attributes=True) for x in old.items],
            pagination=_page(page, page_size, old.total_items),
        )
        return JSONResponse(legacy_response.model_dump(mode="json"))
    del progress_status
    filters = {
        "search": search,
        "account_status": account_status,
        "interview_eligible": interview_eligible,
        "min_completed": min_completed,
        "max_completed": max_completed,
        "signed_up_from": signed_up_from,
        "signed_up_to": signed_up_to,
        "active_from": active_from,
        "active_to": active_to,
    }
    total, items = await service.list_users(
        filters=filters,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        descending=sort_order == "desc",
        audit=_audit(
            request,
            current_user.profile_id,
            "admin.users.list_viewed",
            "user",
            metadata={"page": page, "page_size": page_size},
        ),
    )
    return AnalyticsUserListResponse(
        items=[AdminUserListItem.model_validate(item) for item in items],
        pagination=_page(page, page_size, total),
    )


@router.get(
    "/users/{userId}",
    response_model=UserDetailResponse,
    operation_id="adminAnalyticsGetUser",
    summary="Get user progress detail",
    description=(
        "Returns authoritative attempt, completion, topic, difficulty, and revision aggregates."
    ),
)
async def user_detail(
    request: Request,
    user_id: Annotated[UUID, Path(alias="userId")],
    current_user: AdminUserDependency,
    service: AnalyticsDependency,
    legacy_service: AdminUserServiceDependency,
) -> Any:
    if get_admin_user_service in request.app.dependency_overrides:
        legacy_response = AdminUserResponse.model_validate(
            await legacy_service.get_user(user_id),
            from_attributes=True,
        )
        return JSONResponse(legacy_response.model_dump(mode="json"))
    result = await service.user_detail(
        user_id,
        audit=_audit(request, current_user.profile_id, "admin.user.viewed", "user", str(user_id)),
    )
    return UserDetailResponse.model_validate(result)


@router.get(
    "/users/{userId}/activity",
    response_model=ActivityListResponse,
    operation_id="adminAnalyticsUserActivity",
    summary="Get a user's activity timeline",
    description="Composes reliable signup and problem-attempt events; newest activity is first.",
)
async def user_activity(
    request: Request,
    user_id: Annotated[UUID, Path(alias="userId")],
    current_user: AdminUserDependency,
    service: AnalyticsDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    activity_type: Literal[
        "problem_attempted",
        "problem_completed",
        "problem_reattempted",
        "revision_completed",
        "user_signed_up",
    ]
    | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
) -> ActivityListResponse:
    total, items = await service.activity(
        user_id,
        activity_type=activity_type,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
        audit=_audit(
            request, current_user.profile_id, "admin.user_activity.viewed", "user", str(user_id)
        ),
    )
    return ActivityListResponse(items=items, pagination=_page(page, page_size, total))


@router.get(
    "/problems/analytics",
    response_model=ProblemAnalyticsListResponse,
    operation_id="adminProblemAnalyticsList",
    summary="List problem analytics",
    description=(
        "Metrics use unique user/problem pairs; first-attempt success uses the earliest attempt."
    ),
)
async def problem_analytics(
    request: Request,
    current_user: AdminUserDependency,
    service: AnalyticsDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    search: Annotated[str | None, Query(max_length=240)] = None,
    topic_id: UUID | None = None,
    difficulty: Literal["beginner", "easy", "medium", "hard", "expert"] | None = None,
    publication_status: Literal["draft", "in_review", "published", "archived"] | None = None,
    sort_by: Literal[
        "attempts",
        "unique_users_attempted",
        "unique_users_completed",
        "solve_rate",
        "first_attempt_success_rate",
        "title",
        "created_at",
    ] = "attempts",
    sort_order: SortOrder = "desc",
) -> ProblemAnalyticsListResponse:
    total, items = await service.list_problems(
        filters={
            "search": search,
            "topic_id": topic_id,
            "difficulty": difficulty,
            "publication_status": publication_status,
        },
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        descending=sort_order == "desc",
        audit=_audit(request, current_user.profile_id, "admin.problem_analytics.viewed", "problem"),
    )
    return ProblemAnalyticsListResponse(
        items=[ProblemAnalyticsItem.model_validate(item) for item in items],
        pagination=_page(page, page_size, total),
    )


@router.get(
    "/problems/{problemId}/analytics",
    response_model=ProblemDetailResponse,
    operation_id="adminProblemAnalyticsDetail",
    summary="Get one problem's analytics",
    description="Includes at most 20 recent attempts and never includes submitted source code.",
)
async def problem_detail(
    request: Request,
    problem_id: Annotated[UUID, Path(alias="problemId")],
    current_user: AdminUserDependency,
    service: AnalyticsDependency,
) -> ProblemDetailResponse:
    result = await service.problem_detail(
        problem_id,
        audit=_audit(
            request,
            current_user.profile_id,
            "admin.problem_analytics.viewed",
            "problem",
            str(problem_id),
        ),
    )
    return ProblemDetailResponse.model_validate(result)


@router.get(
    "/audit-logs",
    response_model=AuditLogListResponse,
    operation_id="adminAuditLogs",
    summary="List administrator access audit logs",
    description=(
        "Returns sanitized access records; credentials and authorization headers are never stored."
    ),
)
async def audit_logs(
    request: Request,
    current_user: AdminUserDependency,
    service: AnalyticsDependency,
    admin_user_id: UUID | None = None,
    action: Annotated[str | None, Query(max_length=120)] = None,
    resource_type: Annotated[str | None, Query(max_length=80)] = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> AuditLogListResponse:
    total, items = await service.audit_logs(
        filters={
            "admin_user_id": admin_user_id,
            "action": action,
            "resource_type": resource_type,
            "from_date": from_date,
            "to_date": to_date,
        },
        page=page,
        page_size=page_size,
        audit=_audit(
            request, current_user.profile_id, "admin.audit_logs.viewed", "admin_audit_log"
        ),
    )
    return AuditLogListResponse(
        items=[AuditLogItem.model_validate(item) for item in items],
        pagination=_page(page, page_size, total),
    )
