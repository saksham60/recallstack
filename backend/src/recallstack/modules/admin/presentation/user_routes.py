from datetime import datetime
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request

from recallstack.modules.admin.application.user_inspection import (
    AdminUserService,
    Page,
    UserFilters,
)
from recallstack.modules.admin.presentation.schemas import PaginationResponse
from recallstack.modules.admin.presentation.user_schemas import (
    AdminUserResponse,
    GrantRoleRequest,
    PracticeAttemptListResponse,
    PracticeAttemptResponse,
    ProgressListResponse,
    ProgressResponse,
    ReviewListResponse,
    ReviewResponse,
    RoleGrantListResponse,
    RoleGrantResponse,
    RoleMutationResponse,
    UserListResponse,
)
from recallstack.modules.identity.presentation.dependencies import AdminUserDependency

router = APIRouter(prefix="/admin/users", tags=["admin-users"])
LearningStatusValue = Literal["new", "learning", "attempted", "confident", "mastered"]


def get_admin_user_service(request: Request) -> AdminUserService:
    return cast(AdminUserService, request.app.state.admin_user_service)


AdminUserServiceDependency = Annotated[AdminUserService, Depends(get_admin_user_service)]


def _pagination(page: Page[Any]) -> PaginationResponse:
    return PaginationResponse.create(
        page=page.page, page_size=page.page_size, total_items=page.total_items
    )


@router.get("", response_model=UserListResponse, operation_id="adminListUsers")
async def list_users(
    current_user: AdminUserDependency,
    service: AdminUserServiceDependency,
    progress_status: Annotated[LearningStatusValue | None, Query()] = None,
    activity_from: Annotated[datetime | None, Query()] = None,
    activity_to: Annotated[datetime | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> UserListResponse:
    del current_user
    result = await service.list_users(
        filters=UserFilters(progress_status, activity_from, activity_to),
        page=page,
        page_size=page_size,
    )
    return UserListResponse(
        items=[
            AdminUserResponse.model_validate(item, from_attributes=True) for item in result.items
        ],
        pagination=_pagination(result),
    )


@router.get("/{userId}", response_model=AdminUserResponse, operation_id="adminGetUser")
async def get_user(
    user_id: Annotated[UUID, Path(alias="userId")],
    current_user: AdminUserDependency,
    service: AdminUserServiceDependency,
) -> AdminUserResponse:
    del current_user
    return AdminUserResponse.model_validate(await service.get_user(user_id), from_attributes=True)


@router.get(
    "/{userId}/progress", response_model=ProgressListResponse, operation_id="adminListUserProgress"
)
async def list_progress(
    user_id: Annotated[UUID, Path(alias="userId")],
    current_user: AdminUserDependency,
    service: AdminUserServiceDependency,
    status: Annotated[LearningStatusValue | None, Query()] = None,
    activity_from: Annotated[datetime | None, Query()] = None,
    activity_to: Annotated[datetime | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ProgressListResponse:
    del current_user
    result = await service.list_progress(
        user_id=user_id,
        status=status,
        activity_from=activity_from,
        activity_to=activity_to,
        page=page,
        page_size=page_size,
    )
    return ProgressListResponse(
        items=[
            ProgressResponse.model_validate(item, from_attributes=True) for item in result.items
        ],
        pagination=_pagination(result),
    )


@router.get(
    "/{userId}/practice-attempts",
    response_model=PracticeAttemptListResponse,
    operation_id="adminListUserPracticeAttempts",
)
async def list_practice_attempts(
    user_id: Annotated[UUID, Path(alias="userId")],
    current_user: AdminUserDependency,
    service: AdminUserServiceDependency,
    activity_from: Annotated[datetime | None, Query()] = None,
    activity_to: Annotated[datetime | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> PracticeAttemptListResponse:
    del current_user
    result = await service.list_practice_attempts(
        user_id=user_id,
        activity_from=activity_from,
        activity_to=activity_to,
        page=page,
        page_size=page_size,
    )
    return PracticeAttemptListResponse(
        items=[
            PracticeAttemptResponse.model_validate(item, from_attributes=True)
            for item in result.items
        ],
        pagination=_pagination(result),
    )


@router.get(
    "/{userId}/reviews", response_model=ReviewListResponse, operation_id="adminListUserReviews"
)
async def list_reviews(
    user_id: Annotated[UUID, Path(alias="userId")],
    current_user: AdminUserDependency,
    service: AdminUserServiceDependency,
    activity_from: Annotated[datetime | None, Query()] = None,
    activity_to: Annotated[datetime | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ReviewListResponse:
    del current_user
    result = await service.list_reviews(
        user_id=user_id,
        activity_from=activity_from,
        activity_to=activity_to,
        page=page,
        page_size=page_size,
    )
    return ReviewListResponse(
        items=[ReviewResponse.model_validate(item, from_attributes=True) for item in result.items],
        pagination=_pagination(result),
    )


@router.get(
    "/{userId}/roles", response_model=RoleGrantListResponse, operation_id="adminListUserRoles"
)
async def list_roles(
    user_id: Annotated[UUID, Path(alias="userId")],
    current_user: AdminUserDependency,
    service: AdminUserServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> RoleGrantListResponse:
    del current_user
    result = await service.list_roles(user_id=user_id, page=page, page_size=page_size)
    return RoleGrantListResponse(
        items=[
            RoleGrantResponse.model_validate(item, from_attributes=True) for item in result.items
        ],
        pagination=_pagination(result),
    )


@router.post(
    "/{userId}/roles", response_model=RoleMutationResponse, operation_id="adminGrantUserRole"
)
async def grant_role(
    payload: GrantRoleRequest,
    user_id: Annotated[UUID, Path(alias="userId")],
    current_user: AdminUserDependency,
    service: AdminUserServiceDependency,
) -> RoleMutationResponse:
    result = await service.grant_role(
        user_id=user_id, role_id=payload.role_id, actor_id=current_user.profile_id
    )
    return RoleMutationResponse(
        grant=RoleGrantResponse.model_validate(result.grant, from_attributes=True),
        changed=result.changed,
    )


@router.post(
    "/{userId}/roles/{roleId}/revoke",
    response_model=RoleMutationResponse,
    operation_id="adminRevokeUserRole",
)
async def revoke_role(
    user_id: Annotated[UUID, Path(alias="userId")],
    role_id: Annotated[int, Path(alias="roleId", ge=1, le=32767)],
    current_user: AdminUserDependency,
    service: AdminUserServiceDependency,
) -> RoleMutationResponse:
    result = await service.revoke_role(
        user_id=user_id, role_id=role_id, actor_id=current_user.profile_id
    )
    return RoleMutationResponse(
        grant=RoleGrantResponse.model_validate(result.grant, from_attributes=True),
        changed=result.changed,
    )
