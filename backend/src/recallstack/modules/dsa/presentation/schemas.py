from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator

from recallstack.modules.content.infrastructure.sqlalchemy_models import DifficultyLevel
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.presentation.schemas import (
    NoteKindValue,
    NoteResponse,
    ProgressResponse,
)


class ProblemError(BaseModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str
    request_id: str


class TaxonomyItem(BaseModel):
    id: UUID
    slug: str
    name: str


class TaxonomyCount(TaxonomyItem):
    problem_count: int


class TaxonomyResponse(BaseModel):
    items: list[TaxonomyCount]


class DsaTopicProgress(BaseModel):
    id: UUID
    attempted_count: int
    mastered_count: int


class DsaTopicProgressResponse(BaseModel):
    items: list[DsaTopicProgress]


class ProblemItem(BaseModel):
    id: UUID
    problem_version_id: UUID
    slug: str
    title: str
    difficulty: DifficultyLevel | None
    categories: list[TaxonomyItem]
    topics: list[TaxonomyItem]
    availability: Literal["available", "review_pending", "unavailable"]


class CursorPage(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False


class CatalogResponse(CursorPage):
    items: list[ProblemItem]


class FunctionContract(BaseModel):
    """Public contract allowlist; absent attributes remain absent on the wire."""

    function: str | None = None
    input: str | dict[str, str] | None = None
    output: str | dict[str, str] | None = None
    encoding: str | None = None
    representation: str | None = None
    serialization: str | None = None
    indexing: str | None = None
    indices: str | None = None
    ordering: str | None = None
    tie_break: str | None = None
    absolute_tolerance: float | None = None
    modulus: int | None = None
    directed: bool | None = None
    edge_direction: str | None = None
    case_sensitive: bool | None = None
    strictly_increasing: bool | None = None
    nonunique: str | None = None
    multiple_solutions: str | None = None
    negative_values: str | None = None
    division_permitted: bool | None = None
    whole_string_excluded: bool | None = None
    empty_text: str | None = None
    blank: str | None = None
    blocked: str | None = None
    stops: str | None = None
    scope: str | None = None
    operation: str | None = None
    operations: list[str] | None = None
    job_fields: list[str] | None = None
    result_keys: list[str] | None = None


class Example(BaseModel):
    input: JsonValue
    output: JsonValue
    explanation: str | None = None


class ProblemDetail(ProblemItem):
    description: str
    function_contract: FunctionContract
    constraints: list[str]
    examples: list[Example]
    supported_contract_languages: list[str]


class PublicTestCase(BaseModel):
    id: UUID
    input_json: JsonValue
    expected_output_json: JsonValue


class TestCasesResponse(CursorPage):
    problem_version_id: UUID
    items: list[PublicTestCase]
    has_verified_public_tests: bool


class DsaProgressResponse(ProgressResponse):
    sync_cursor: int | None = None


class ProgressPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    row_version: int = Field(ge=0)
    status: LearningStatus | None = None
    confidence: int | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        fields = self.model_fields_set - {"row_version"}
        if not fields or any(getattr(self, name) is None for name in fields):
            raise ValueError("Provide a non-null status or confidence")
        return self


class BookmarkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    problem_id: UUID


class BookmarkWriteResponse(BaseModel):
    changed: bool
    sync_cursor: int | None


class NoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: NoteKindValue
    title: str | None = Field(default=None, max_length=240)
    body: str = Field(min_length=1, max_length=100_000)

    @field_validator("title", "body")
    @classmethod
    def normalize(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value.strip():
            raise ValueError("text must not be blank")
        return value.strip()


class DsaNoteResponse(NoteResponse):
    sync_cursor: int | None = None


class PracticeHistoryItem(BaseModel):
    id: UUID
    content_item_id: UUID
    attempted_at: datetime
    outcome: Literal[
        "solved_independently",
        "solved_with_hint",
        "understood_not_coded",
        "pattern_not_identified",
        "skipped",
    ]
    duration_seconds: int | None
    hint_used: bool
    confidence_before: int | None
    confidence_after: int | None


class PracticeHistoryResponse(CursorPage):
    items: list[PracticeHistoryItem]


class StatisticsResponse(BaseModel):
    total_catalog_problems: int
    attempted_problem_count: int
    practice_attempt_count: int
    learning_status_counts: dict[LearningStatus, int]
    mastered_problem_count: int
    self_reported_solved_attempt_count: int


class CapabilitiesResponse(BaseModel):
    catalog: bool
    progress: bool
    bookmarks: bool
    notes: bool
    practice_history: bool
    sandbox_execution: Literal[False]
    ai_tutoring: Literal[False]
    published_contract_languages: list[str]
    configured_runtime_languages: list[str]
    execution_languages: list[str]
