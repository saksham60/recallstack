from datetime import datetime
from math import ceil
from typing import Annotated, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency
from recallstack.modules.recall.application.review_submission import RecallService, SubmitReview

router = APIRouter(prefix="/me/reviews", tags=["recall"])


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class DueItem(BaseModel):
    card_id: UUID
    due_at: datetime
    row_version: int
    content_item_id: UUID
    slug: str
    title: str
    summary: str | None
    type: str
    difficulty: str | None


class DueResponse(BaseModel):
    items: list[DueItem]
    pagination: Pagination


class SubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    review_event_id: UUID
    rating: Literal["again", "hard", "good", "easy"]
    response_time_ms: int | None = Field(default=None, ge=0)
    reviewed_at: datetime
    expected_row_version: int = Field(ge=1)


class SubmitResponse(BaseModel):
    review_history_id: int
    card_id: UUID
    next_review_at: datetime
    row_version: int
    newly_applied: bool


class HistoryItem(BaseModel):
    id: int
    review_event_id: UUID
    card_id: UUID
    content_item_id: UUID
    rating: str
    reviewed_at: datetime
    response_time_ms: int | None
    previous_due_at: datetime | None
    next_due_at: datetime
    interval_days_after: float | None
    scheduler_name: str
    scheduler_version: str


class HistoryResponse(BaseModel):
    items: list[HistoryItem]
    pagination: Pagination


def _service(request: Request) -> RecallService:
    return cast(RecallService, request.app.state.recall_service)


def _pagination(total: int, page: int, page_size: int) -> Pagination:
    return Pagination(
        page=page,
        page_size=page_size,
        total_items=total,
        total_pages=ceil(total / page_size) if total else 0,
    )


@router.get("/due", response_model=DueResponse)
async def due(
    current_user: CurrentUserDependency,
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> DueResponse:
    total, items = await _service(request).due(
        profile_id=current_user.profile_id, page=page, page_size=page_size
    )
    return DueResponse(
        items=[DueItem.model_validate(item, from_attributes=True) for item in items],
        pagination=_pagination(total, page, page_size),
    )


@router.post("/{cardId}/submit", response_model=SubmitResponse)
async def submit(
    card_id: Annotated[UUID, Path(alias="cardId")],
    payload: SubmitRequest,
    current_user: CurrentUserDependency,
    request: Request,
) -> SubmitResponse:
    result = await _service(request).submit(
        profile_id=current_user.profile_id,
        card_id=card_id,
        command=SubmitReview(
            payload.review_event_id,
            payload.rating,
            payload.response_time_ms,
            payload.reviewed_at,
            payload.expected_row_version,
        ),
    )
    return SubmitResponse.model_validate(result, from_attributes=True)


@router.get("/history", response_model=HistoryResponse)
async def history(
    current_user: CurrentUserDependency,
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> HistoryResponse:
    total, items = await _service(request).history(
        profile_id=current_user.profile_id, page=page, page_size=page_size
    )
    return HistoryResponse(
        items=[HistoryItem.model_validate(item, from_attributes=True) for item in items],
        pagination=_pagination(total, page, page_size),
    )
