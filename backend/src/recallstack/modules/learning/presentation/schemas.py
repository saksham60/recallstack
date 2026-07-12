from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from recallstack.modules.learning.domain.enums import LearningStatus

NoteKindValue = Literal["note", "mistake", "insight"]


class PaginationResponse(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ProgressResponse(BaseModel):
    content_item_id: UUID
    status: LearningStatus
    confidence: int = Field(ge=0, le=100)
    last_opened_at: datetime | None
    row_version: int = Field(ge=0)
    updated_at: datetime | None


class ProgressListResponse(BaseModel):
    items: list[ProgressResponse]
    pagination: PaginationResponse


class ProgressPutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: LearningStatus
    confidence: int = Field(ge=0, le=100)
    row_version: int = Field(ge=0)


class BookmarkResponse(BaseModel):
    content_item_id: UUID
    slug: str
    title: str | None
    created_at: datetime


class BookmarkListResponse(BaseModel):
    items: list[BookmarkResponse]
    pagination: PaginationResponse


class NoteResponse(BaseModel):
    id: UUID
    content_item_id: UUID
    kind: NoteKindValue
    title: str | None
    body: str
    row_version: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class NoteListResponse(BaseModel):
    items: list[NoteResponse]
    pagination: PaginationResponse


class NoteCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content_item_id: UUID
    kind: NoteKindValue
    title: str | None = Field(default=None, max_length=240)
    body: str = Field(min_length=1, max_length=100_000)

    @field_validator("title", "body")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("text must not be blank")
        return normalized


class NotePatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row_version: int = Field(ge=1)
    kind: NoteKindValue | None = None
    title: str | None = Field(default=None, max_length=240)
    body: str | None = Field(default=None, min_length=1, max_length=100_000)

    @field_validator("title", "body")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("text must not be blank")
        return normalized

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if self.model_fields_set <= {"row_version"}:
            raise ValueError("at least one note field must be provided")
        return self


class NoteDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row_version: int = Field(ge=1)
