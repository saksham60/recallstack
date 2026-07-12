from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from recallstack.modules.learning.domain.enums import LearningStatus

PracticeOutcomeRequest = Literal[
    "solved_independently",
    "solved_with_hint",
    "understood_but_could_not_code",
    "pattern_not_identified",
    "skipped",
]


class PracticeAttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempt_event_id: UUID
    content_item_id: UUID
    practice_resource_id: UUID | None = None
    outcome: PracticeOutcomeRequest
    duration_seconds: int | None = Field(default=None, ge=0)
    hint_used: bool = False
    confidence_before: int | None = Field(default=None, ge=0, le=100)
    confidence_after: int | None = Field(default=None, ge=0, le=100)
    attempted_at: datetime


class PracticeAttemptResponse(BaseModel):
    attempt_id: UUID
    updated_progress: LearningStatus
    updated_confidence: int = Field(ge=0, le=100)
    review_card_id: UUID
    next_review_at: datetime
    newly_applied: bool
