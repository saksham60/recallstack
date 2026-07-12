import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from types import TracebackType
from typing import ClassVar, Protocol, Self
from uuid import UUID, uuid4

from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.errors import AppError
from recallstack.shared.events import DomainEvent, EventPublisher

logger = logging.getLogger(__name__)


class AttemptOutcome:
    SOLVED_INDEPENDENTLY = "solved_independently"
    SOLVED_WITH_HINT = "solved_with_hint"
    UNDERSTOOD_BUT_COULD_NOT_CODE = "understood_but_could_not_code"
    PATTERN_NOT_IDENTIFIED = "pattern_not_identified"
    SKIPPED = "skipped"


@dataclass(frozen=True, slots=True)
class SubmitPracticeAttempt:
    attempt_event_id: UUID
    content_item_id: UUID
    practice_resource_id: UUID | None
    outcome: str
    duration_seconds: int | None
    hint_used: bool
    confidence_before: int | None
    confidence_after: int | None
    attempted_at: datetime


@dataclass(frozen=True, slots=True)
class ReviewSchedule:
    due_at: datetime
    interval_days: float


class InitialReviewScheduler(Protocol):
    def schedule(self, *, outcome: str, attempted_at: datetime) -> ReviewSchedule: ...


class DeterministicInitialReviewScheduler:
    _interval_days: ClassVar[dict[str, float]] = {
        AttemptOutcome.SOLVED_INDEPENDENTLY: 7.0,
        AttemptOutcome.SOLVED_WITH_HINT: 3.0,
        AttemptOutcome.UNDERSTOOD_BUT_COULD_NOT_CODE: 2.0,
        AttemptOutcome.PATTERN_NOT_IDENTIFIED: 1.0,
        AttemptOutcome.SKIPPED: 1.0,
    }

    def schedule(self, *, outcome: str, attempted_at: datetime) -> ReviewSchedule:
        days = self._interval_days[outcome]
        return ReviewSchedule(due_at=attempted_at + timedelta(days=days), interval_days=days)


@dataclass(frozen=True, slots=True)
class AttemptResult:
    attempt_id: UUID
    updated_progress: LearningStatus
    updated_confidence: int
    review_card_id: UUID
    next_review_at: datetime
    newly_applied: bool


@dataclass(frozen=True, slots=True)
class PersistedAttempt:
    id: UUID
    user_id: UUID
    command: SubmitPracticeAttempt
    progress: LearningStatus
    confidence: int
    review_card_id: UUID
    next_review_at: datetime


class PracticeAttemptRepository(Protocol):
    async def find_by_event_id(self, attempt_event_id: UUID) -> PersistedAttempt | None: ...

    async def ensure_published_content(self, content_item_id: UUID) -> None: ...

    async def resolve_provider(
        self, *, content_item_id: UUID, practice_resource_id: UUID | None
    ) -> int: ...

    async def apply_attempt(
        self,
        *,
        profile_id: UUID,
        command: SubmitPracticeAttempt,
        provider_id: int,
        progress: LearningStatus,
        schedule: ReviewSchedule,
    ) -> AttemptResult: ...


class AttemptEventRace(Exception):
    """The unique idempotency key was inserted by a concurrent request."""


class PracticeAttemptUnitOfWork(Protocol):
    repository: PracticeAttemptRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...


class PracticeAttemptService:
    def __init__(
        self,
        unit_of_work: Callable[[], PracticeAttemptUnitOfWork],
        scheduler: InitialReviewScheduler,
        publisher: EventPublisher | None,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._scheduler = scheduler
        self._publisher = publisher

    async def submit(self, *, profile_id: UUID, command: SubmitPracticeAttempt) -> AttemptResult:
        try:
            async with self._unit_of_work() as uow:
                existing = await uow.repository.find_by_event_id(command.attempt_event_id)
                if existing is not None:
                    return self._deduplicated(existing, profile_id, command)
                await uow.repository.ensure_published_content(command.content_item_id)
                provider_id = await uow.repository.resolve_provider(
                    content_item_id=command.content_item_id,
                    practice_resource_id=command.practice_resource_id,
                )
                progress = self._progress_for(command.outcome)
                schedule = self._scheduler.schedule(
                    outcome=command.outcome, attempted_at=command.attempted_at
                )
                result = await uow.repository.apply_attempt(
                    profile_id=profile_id,
                    command=command,
                    provider_id=provider_id,
                    progress=progress,
                    schedule=schedule,
                )
                await uow.commit()
        except AttemptEventRace:
            async with self._unit_of_work() as uow:
                existing = await uow.repository.find_by_event_id(command.attempt_event_id)
            if existing is None:
                raise
            return self._deduplicated(existing, profile_id, command)
        await self._publish(profile_id, command, result)
        return result

    @staticmethod
    def _progress_for(outcome: str) -> LearningStatus:
        return {
            AttemptOutcome.SOLVED_INDEPENDENTLY: LearningStatus.CONFIDENT,
            AttemptOutcome.SOLVED_WITH_HINT: LearningStatus.ATTEMPTED,
            AttemptOutcome.UNDERSTOOD_BUT_COULD_NOT_CODE: LearningStatus.LEARNING,
            AttemptOutcome.PATTERN_NOT_IDENTIFIED: LearningStatus.LEARNING,
            AttemptOutcome.SKIPPED: LearningStatus.NEW,
        }[outcome]

    @staticmethod
    def _deduplicated(
        existing: PersistedAttempt, profile_id: UUID, command: SubmitPracticeAttempt
    ) -> AttemptResult:
        if existing.user_id != profile_id or existing.command != command:
            raise AppError(
                error_type="attempt-event-conflict",
                title="Attempt event conflict",
                status=409,
                detail="attempt_event_id has already been used with a different command",
            )
        return AttemptResult(
            attempt_id=existing.id,
            updated_progress=existing.progress,
            updated_confidence=existing.confidence,
            review_card_id=existing.review_card_id,
            next_review_at=existing.next_review_at,
            newly_applied=False,
        )

    async def _publish(
        self, profile_id: UUID, command: SubmitPracticeAttempt, result: AttemptResult
    ) -> None:
        if self._publisher is None:
            return
        try:
            await self._publisher.publish(
                (
                    DomainEvent(
                        event_id=uuid4(),
                        event_type="PracticeAttemptRecorded",
                        occurred_at=command.attempted_at,
                        payload={
                            "profile_id": str(profile_id),
                            "attempt_id": str(result.attempt_id),
                            "content_item_id": str(command.content_item_id),
                        },
                    ),
                )
            )
        except Exception:
            logger.warning("practice_attempt_event_publish_failed", exc_info=True)
