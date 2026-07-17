from datetime import datetime
from math import ceil
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

ContentTypeValue = Literal["problem", "concept", "pattern", "article", "architecture", "case_study"]
DifficultyValue = Literal["easy", "medium", "hard"]
PublicationStatusValue = Literal["draft", "in_review", "published", "archived"]
BlockTypeValue = Literal[
    "recognize",
    "remember",
    "invariant",
    "approach",
    "code",
    "mistake",
    "warning",
    "diagram",
    "table",
    "architecture_flow",
    "quiz",
    "related_content",
    "external_link",
]
Slug = Annotated[
    str,
    StringConstraints(
        min_length=3,
        max_length=120,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    ),
]


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateContentRequest(StrictSchema):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "domain_id": "00000000-0000-0000-0000-000000000001",
                    "slug": "maximum-subarray",
                    "type": "problem",
                    "difficulty": "medium",
                }
            ]
        },
    )
    domain_id: UUID
    slug: Slug
    type: ContentTypeValue
    difficulty: DifficultyValue | None = None

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_difficulty(self) -> Self:
        if self.type == "problem" and self.difficulty is None:
            raise ValueError("difficulty is required when type is problem")
        if self.type != "problem" and self.difficulty is not None:
            raise ValueError("difficulty must be null for non-problem content")
        return self


class CreatedContentResponse(StrictSchema):
    content_item_id: UUID
    draft_version_id: UUID
    domain_id: UUID
    slug: str
    type: str
    difficulty: str | None
    version_number: int
    version_status: str


class CreatedDraftResponse(StrictSchema):
    content_item_id: UUID
    draft_version_id: UUID
    version_number: int
    version_status: str
    row_version: int


class WorkflowHistoryResponse(StrictSchema):
    from_status: str | None
    to_status: str
    changed_by: UUID | None
    reason: str | None
    changed_at: datetime


class VersionResponse(StrictSchema):
    id: UUID
    content_item_id: UUID
    version_number: int
    status: str
    title: str
    summary: str | None
    authored_by: UUID | None
    reviewed_by: UUID | None
    published_by: UUID | None
    published_at: datetime | None
    row_version: int
    created_at: datetime
    updated_at: datetime
    history: list[WorkflowHistoryResponse]


class PaginationResponse(StrictSchema):
    page: int
    page_size: int
    total_items: int
    total_pages: int

    @classmethod
    def create(cls, *, page: int, page_size: int, total_items: int) -> "PaginationResponse":
        return cls(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=ceil(total_items / page_size) if total_items else 0,
        )


class VersionListResponse(StrictSchema):
    items: list[VersionResponse]
    pagination: PaginationResponse


class DocumentBlockRequest(StrictSchema):
    type: BlockTypeValue
    heading: Annotated[str | None, Field(max_length=240)] = None
    payload: dict[str, object]


class TopicAssignmentRequest(StrictSchema):
    topic_id: UUID
    is_primary: bool = False
    sort_order: Annotated[int, Field(ge=0)] = 0


class DocumentUpdateRequest(StrictSchema):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "expected_row_version": 3,
                    "title": "Maximum Subarray",
                    "summary": "Find the contiguous subarray with the largest sum.",
                    "blocks": [
                        {
                            "type": "recognize",
                            "heading": "Recognition Signal",
                            "payload": {
                                "text": "Look for the maximum sum over a contiguous range."
                            },
                        }
                    ],
                    "category_ids": ["00000000-0000-0000-0000-000000000001"],
                    "topics": [
                        {
                            "topic_id": "00000000-0000-0000-0000-000000000002",
                            "is_primary": True,
                            "sort_order": 0,
                        }
                    ],
                }
            ]
        },
    )
    expected_row_version: Annotated[int, Field(ge=1)]
    title: Annotated[str, Field(max_length=240)]
    summary: str | None = None
    blocks: Annotated[list[DocumentBlockRequest], Field(max_length=500)]
    category_ids: Annotated[list[UUID], Field(max_length=100)]
    topics: Annotated[list[TopicAssignmentRequest], Field(max_length=500)]


class PracticeResourceRequest(StrictSchema):
    id: UUID | None = None
    provider_id: Annotated[int, Field(gt=0, le=32767)]
    external_key: Annotated[str | None, Field(max_length=255)] = None
    url: AnyHttpUrl
    title: Annotated[str | None, Field(max_length=300)] = None
    is_primary: bool = False
    sort_order: Annotated[int, Field(ge=0)] = 0

    @field_validator("url")
    @classmethod
    def require_https(cls, value: AnyHttpUrl) -> AnyHttpUrl:
        if value.scheme != "https":
            raise ValueError("url must use HTTPS")
        return value


class ReplacePracticeResourcesRequest(StrictSchema):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "expected_revision": 3,
                    "resources": [
                        {
                            "id": None,
                            "provider_id": 1,
                            "external_key": "53",
                            "url": "https://leetcode.com/problems/maximum-subarray/",
                            "title": "Maximum Subarray",
                            "is_primary": True,
                            "sort_order": 0,
                        }
                    ],
                }
            ]
        },
    )
    expected_revision: Annotated[int, Field(ge=1)]
    resources: Annotated[list[PracticeResourceRequest], Field(max_length=100)]


class PracticeResourceResponse(StrictSchema):
    id: UUID
    provider_id: int
    external_key: str | None
    url: str
    title: str | None
    is_primary: bool
    sort_order: int


class PracticeResourceSetResponse(StrictSchema):
    content_item_id: UUID
    revision: int
    resources: list[PracticeResourceResponse]


class TransitionRequest(StrictSchema):
    expected_row_version: Annotated[int, Field(ge=1)]
    reason: Annotated[str | None, Field(min_length=1, max_length=1000)] = None


class RequiredReasonTransitionRequest(StrictSchema):
    expected_row_version: Annotated[int, Field(ge=1)]
    reason: Annotated[str, Field(min_length=1, max_length=1000)]


class PublishRequest(RequiredReasonTransitionRequest):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "expected_row_version": 5,
                    "reason": "Reviewed and approved for initial DSA release",
                }
            ]
        },
    )


class PublishedVersionResponse(StrictSchema):
    content_item_id: UUID
    version_id: UUID
    version_number: int
    status: str
    row_version: int
    published_at: datetime
    reviewed_by: UUID
    published_by: UUID


class ArchiveRequest(StrictSchema):
    reason: Annotated[str, Field(min_length=1, max_length=1000)]


class ArchivedContentResponse(StrictSchema):
    content_item_id: UUID
    archived_at: datetime
