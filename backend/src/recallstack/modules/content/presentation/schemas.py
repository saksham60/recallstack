from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from recallstack.modules.learning.domain.enums import LearningStatus


class PrimaryTopicResponse(BaseModel):
    slug: str
    name: str


class PrimaryPracticeResourceResponse(BaseModel):
    id: UUID
    provider_slug: str
    provider_name: str
    title: str | None
    url: str


class ContentUserProgressResponse(BaseModel):
    status: LearningStatus
    confidence: int = Field(ge=0, le=100)


class CategoryContentItemResponse(BaseModel):
    content_item_id: UUID
    slug: str
    type: str
    title: str
    summary: str | None
    difficulty: str | None
    primary_topic: PrimaryTopicResponse | None
    primary_practice_resource: PrimaryPracticeResourceResponse | None
    user_progress: ContentUserProgressResponse
    is_bookmarked: bool
    last_opened_at: datetime | None
    next_review_at: datetime | None


class PaginationResponse(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CategoryContentListResponse(BaseModel):
    items: list[CategoryContentItemResponse]
    pagination: PaginationResponse


ContentTypeQuery = Literal["problem", "concept", "pattern", "article", "architecture", "case_study"]
DifficultyQuery = Literal["easy", "medium", "hard"]
SortQuery = Literal["sort_order", "title", "difficulty", "updated_at"]
