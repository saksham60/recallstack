from datetime import datetime
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator

EntityType = Literal["progress", "bookmark", "note", "practice_attempt", "review"]
MutationOperationValue = Literal["insert", "update", "delete"]


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DeviceRegisterRequest(StrictSchema):
    device_name: Annotated[str | None, Field(default=None, min_length=1, max_length=160)]
    platform: Literal["android", "ios", "web", "windows", "macos", "linux"]
    app_version: Annotated[str | None, Field(default=None, min_length=1, max_length=40)]

    @field_validator("device_name", "app_version")
    @classmethod
    def normalize_optional(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class DeviceResponse(StrictSchema):
    id: UUID
    device_name: str | None
    platform: str
    app_version: str | None
    last_seen_at: datetime | None
    registered_at: datetime
    revoked_at: datetime | None


class PaginationResponse(StrictSchema):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class DeviceListResponse(StrictSchema):
    items: list[DeviceResponse]
    pagination: PaginationResponse


class ProgressPayload(StrictSchema):
    status: Literal["new", "learning", "attempted", "confident", "mastered"]
    confidence: Annotated[int, Field(ge=0, le=100)]


class NoteCreatePayload(StrictSchema):
    content_item_id: UUID
    kind: Literal["note", "mistake", "insight"]
    title: Annotated[str | None, Field(default=None, max_length=240)]
    body: Annotated[str, Field(min_length=1, max_length=100_000)]


class NoteUpdatePayload(StrictSchema):
    kind: Literal["note", "mistake", "insight"] | None = None
    title: Annotated[str | None, Field(default=None, max_length=240)]
    body: Annotated[str | None, Field(default=None, min_length=1, max_length=100_000)]

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one note field must be supplied")
        return self


class PracticeAttemptPayload(StrictSchema):
    content_item_id: UUID
    practice_resource_id: UUID | None = None
    outcome: Literal[
        "solved_independently",
        "solved_with_hint",
        "understood_but_could_not_code",
        "pattern_not_identified",
        "skipped",
    ]
    duration_seconds: Annotated[int | None, Field(default=None, ge=0)]
    hint_used: bool = False
    confidence_before: Annotated[int | None, Field(default=None, ge=0, le=100)]
    confidence_after: Annotated[int | None, Field(default=None, ge=0, le=100)]
    attempted_at: datetime


class ReviewPayload(StrictSchema):
    review_event_id: UUID
    rating: Literal["again", "hard", "good", "easy"]
    response_time_ms: Annotated[int | None, Field(default=None, ge=0)]
    reviewed_at: datetime
    expected_row_version: Annotated[int, Field(ge=1)]


class MutationRequest(StrictSchema):
    mutation_id: UUID
    entity_type: EntityType
    entity_id: UUID
    operation: MutationOperationValue
    base_row_version: Annotated[int | None, Field(default=None, ge=1)]
    payload: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_contract(self) -> Self:
        adapter: TypeAdapter[BaseModel]
        if self.entity_type == "progress":
            if self.operation not in {"insert", "update"}:
                raise ValueError("progress supports insert and update")
            self._require_base(update=self.operation == "update")
            adapter = TypeAdapter(ProgressPayload)
        elif self.entity_type == "bookmark":
            if self.operation not in {"insert", "delete"}:
                raise ValueError("bookmark supports insert and delete")
            if self.base_row_version is not None or self.payload:
                raise ValueError("bookmark mutations do not accept version or payload")
            return self
        elif self.entity_type == "note":
            self._require_base(update=self.operation != "insert")
            if self.operation == "insert":
                adapter = TypeAdapter(NoteCreatePayload)
            elif self.operation == "update":
                adapter = TypeAdapter(NoteUpdatePayload)
            else:
                if self.payload:
                    raise ValueError("note delete does not accept payload")
                return self
        elif self.entity_type == "practice_attempt":
            if self.operation != "insert" or self.base_row_version is not None:
                raise ValueError("practice attempts are append-only inserts")
            adapter = TypeAdapter(PracticeAttemptPayload)
        else:
            if self.operation != "insert" or self.base_row_version is not None:
                raise ValueError("reviews are append-only commands")
            adapter = TypeAdapter(ReviewPayload)
        validated = adapter.validate_python(self.payload)
        self.payload = validated.model_dump(mode="json", exclude_unset=True)
        return self

    def _require_base(self, *, update: bool) -> None:
        if update and self.base_row_version is None:
            raise ValueError("base_row_version is required for updates and deletes")
        if not update and self.base_row_version is not None:
            raise ValueError("base_row_version must be omitted for inserts")


class MutationEnvelope(StrictSchema):
    device_id: UUID
    mutation: MutationRequest


class MutationBatchRequest(StrictSchema):
    device_id: UUID
    mutations: Annotated[list[MutationRequest], Field(min_length=1, max_length=100)]

    @model_validator(mode="after")
    def unique_mutation_ids(self) -> Self:
        ids = [mutation.mutation_id for mutation in self.mutations]
        if len(ids) != len(set(ids)):
            raise ValueError("mutation_id values must be unique within a batch")
        return self


class MutationResponse(StrictSchema):
    mutation_id: UUID
    status: Literal["applied", "rejected"]
    deduplicated: bool
    cursor: int | None
    entity_type: str
    entity_id: UUID
    operation: str
    resulting_row_version: int | None
    error_code: str | None
    result: dict[str, object] | None


class MutationBatchResponse(StrictSchema):
    results: list[MutationResponse]
    applied_count: int
    rejected_count: int


class ChangeResponse(StrictSchema):
    cursor: int
    entity_type: str
    entity_id: UUID
    operation: Literal["upsert", "delete"]
    entity_version: int | None
    changed_at: datetime


class ChangeFeedResponse(StrictSchema):
    changes: list[ChangeResponse]
    after: int
    next_cursor: int
    has_more: bool
    full_resync_required: bool
