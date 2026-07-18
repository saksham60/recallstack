from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from recallstack.modules.admin.presentation.schemas import PaginationResponse


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AdminUserResponse(StrictSchema):
    id: UUID
    display_name: str | None
    created_at: datetime
    updated_at: datetime
    active_roles: list[str]
    progress_count: int
    practice_attempt_count: int
    review_count: int
    last_activity_at: datetime | None


class UserListResponse(StrictSchema):
    items: list[AdminUserResponse]
    pagination: PaginationResponse


class ProgressResponse(StrictSchema):
    content_item_id: UUID
    content_slug: str
    title: str | None
    status: str
    confidence: int
    last_opened_at: datetime | None
    row_version: int
    created_at: datetime
    updated_at: datetime


class ProgressListResponse(StrictSchema):
    items: list[ProgressResponse]
    pagination: PaginationResponse


class PracticeAttemptResponse(StrictSchema):
    id: UUID
    content_item_id: UUID
    content_slug: str
    title: str | None
    practice_resource_id: UUID | None
    provider_id: int
    provider_name: str
    outcome: str
    duration_seconds: int | None
    hint_used: bool
    confidence_before: int | None
    confidence_after: int | None
    attempted_at: datetime
    created_at: datetime


class PracticeAttemptListResponse(StrictSchema):
    items: list[PracticeAttemptResponse]
    pagination: PaginationResponse


class ReviewResponse(StrictSchema):
    id: int
    review_card_id: UUID
    content_item_id: UUID
    content_slug: str
    title: str | None
    rating: str
    response_time_ms: int | None
    previous_due_at: datetime | None
    next_due_at: datetime
    scheduler_name: str
    scheduler_version: str
    reviewed_at: datetime
    created_at: datetime


class ReviewListResponse(StrictSchema):
    items: list[ReviewResponse]
    pagination: PaginationResponse


class RoleGrantResponse(StrictSchema):
    grant_id: int
    role_id: int
    role_code: str
    role_description: str | None
    granted_at: datetime
    granted_by: UUID | None
    revoked_at: datetime | None
    revoked_by: UUID | None
    active: bool


class RoleGrantListResponse(StrictSchema):
    items: list[RoleGrantResponse]
    pagination: PaginationResponse


class GrantRoleRequest(StrictSchema):
    role_id: Annotated[int, Field(ge=1, le=32767)]


class RoleMutationResponse(StrictSchema):
    grant: RoleGrantResponse
    changed: bool
