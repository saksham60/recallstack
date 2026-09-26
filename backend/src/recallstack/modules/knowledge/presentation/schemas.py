from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from recallstack.modules.knowledge.domain.entities import EventType
from recallstack.modules.knowledge.domain.ranking import normalize_topic


class Schema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
    )


class SourceResponse(Schema):
    key: str
    name: str


class StoryResponse(Schema):
    id: UUID
    title: str
    summary: str
    why_it_matters: str
    source: SourceResponse
    source_url: str = Field(validation_alias="canonical_url")
    image_url: str
    published_at: datetime
    topics: tuple[str, ...]
    importance_score: float
    quality_score: float


class FeedResponse(Schema):
    items: tuple[StoryResponse, ...]
    next_cursor: str | None
    has_more: bool


Weight = Annotated[Decimal, Field(ge=0, le=2, max_digits=5, decimal_places=4)]
Score = Annotated[Decimal, Field(ge=0, le=1, max_digits=5, decimal_places=4)]


class TopicInput(Schema):
    topic: str = Field(min_length=1, max_length=80)
    weight: Weight = Decimal(1)
    blocked: bool = False

    @field_validator("topic")
    @classmethod
    def normalize(cls, value: str) -> str:
        return normalize_topic(value)


class SourceInput(Schema):
    key: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,79}$")
    enabled: bool = True
    weight: Weight = Decimal(1)


class PreferencesResponse(Schema):
    minimum_importance: float
    topics: tuple[TopicInput, ...]
    sources: tuple[SourceInput, ...]


class PreferencesPatch(Schema):
    minimum_importance: Score | None = None
    topics: list[TopicInput] | None = Field(default=None, max_length=50)
    sources: list[SourceInput] | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def reject_null(self) -> "PreferencesPatch":
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Omit unchanged fields; use an empty array to clear preferences")
        return self


class EventInput(Schema):
    event_id: UUID
    story_id: UUID
    type: EventType
    occurred_at: AwareDatetime


class EventBatch(Schema):
    events: list[EventInput] = Field(min_length=1, max_length=100)


class EventResult(Schema):
    accepted: int
    duplicates: int
