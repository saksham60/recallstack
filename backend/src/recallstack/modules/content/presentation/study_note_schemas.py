from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from recallstack.modules.learning.domain.enums import LearningStatus


class StudyNoteDomainResponse(BaseModel):
    id: UUID
    slug: str
    name: str


class StudyNoteCategoryResponse(BaseModel):
    id: UUID
    slug: str
    name: str
    sort_order: int


class StudyNoteTopicResponse(BaseModel):
    id: UUID
    slug: str
    name: str
    kind: str
    is_primary: bool
    sort_order: int


class StudyNoteBlockResponse(BaseModel):
    id: UUID
    type: str
    heading: str | None
    position: int
    payload: dict[str, Any]


class StudyNoteContentReferenceResponse(BaseModel):
    content_item_id: UUID
    slug: str
    type: str
    difficulty: str | None
    title: str
    summary: str | None
    relation_type: str
    sort_order: int


class StudyNotePracticeResourceResponse(BaseModel):
    id: UUID
    provider_slug: str
    provider_name: str
    external_key: str | None
    title: str | None
    url: str
    is_primary: bool
    sort_order: int


class StudyNoteUserProgressResponse(BaseModel):
    status: LearningStatus
    confidence: int = Field(ge=0, le=100)
    last_opened_at: datetime | None


class StudyNoteReviewCardResponse(BaseModel):
    due_at: datetime
    interval_days: float
    review_count: int
    lapse_count: int
    last_reviewed_at: datetime | None


class PublishedStudyNoteResponse(BaseModel):
    content_item_id: UUID
    slug: str
    domain: StudyNoteDomainResponse
    categories: list[StudyNoteCategoryResponse]
    topics: list[StudyNoteTopicResponse]
    primary_topic: StudyNoteTopicResponse | None
    type: str
    difficulty: str | None
    published_version_number: int
    title: str
    summary: str | None
    blocks: list[StudyNoteBlockResponse]
    related_content: list[StudyNoteContentReferenceResponse]
    prerequisites: list[StudyNoteContentReferenceResponse]
    practice_resources: list[StudyNotePracticeResourceResponse]
    user_progress: StudyNoteUserProgressResponse
    is_bookmarked: bool
    review_card: StudyNoteReviewCardResponse | None
