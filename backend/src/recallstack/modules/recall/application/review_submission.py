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


@dataclass(frozen=True, slots=True)
class ReviewCardState:
    id: UUID
    content_item_id: UUID
    due_at: datetime
    interval_days: float
    review_count: int
    lapse_count: int
    row_version: int
    scheduler_name: str
    scheduler_version: str
    scheduler_state: dict[str, object]


@dataclass(frozen=True, slots=True)
class ReviewSchedule:
    due_at: datetime
    interval_days: float
    scheduler_name: str
    scheduler_version: str
    scheduler_state: dict[str, object]


class ReviewScheduler(Protocol):
    def schedule(
        self, *, card: ReviewCardState, rating: str, reviewed_at: datetime
    ) -> ReviewSchedule: ...


class DeterministicReviewScheduler:
    name = "deterministic-v1"
    version = "1"
    _multipliers: ClassVar[dict[str, float]] = {
        "again": 0.5,
        "hard": 1.2,
        "good": 2.0,
        "easy": 3.0,
    }

    def schedule(
        self, *, card: ReviewCardState, rating: str, reviewed_at: datetime
    ) -> ReviewSchedule:
        base = max(card.interval_days, 1.0)
        interval = max(1.0, round(base * self._multipliers[rating], 4))
        return ReviewSchedule(
            due_at=reviewed_at + timedelta(days=interval),
            interval_days=interval,
            scheduler_name=self.name,
            scheduler_version=self.version,
            scheduler_state={"last_rating": rating, "interval_days": interval},
        )


@dataclass(frozen=True, slots=True)
class SubmitReview:
    review_event_id: UUID
    rating: str
    response_time_ms: int | None
    reviewed_at: datetime
    expected_row_version: int


@dataclass(frozen=True, slots=True)
class ReviewSubmissionResult:
    review_history_id: int
    card_id: UUID
    next_review_at: datetime
    row_version: int
    newly_applied: bool


@dataclass(frozen=True, slots=True)
class DueReview:
    card_id: UUID
    due_at: datetime
    row_version: int
    content_item_id: UUID
    slug: str
    title: str
    summary: str | None
    type: str
    difficulty: str | None


@dataclass(frozen=True, slots=True)
class ReviewHistoryEntry:
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


class ReviewEventRace(Exception):
    pass


class StaleReviewCard(Exception):
    pass


class RecallRepository(Protocol):
    async def list_due(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[DueReview, ...]]: ...

    async def list_history(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[ReviewHistoryEntry, ...]]: ...

    async def find_history_event(self, review_event_id: UUID) -> ReviewHistoryEntry | None: ...

    async def load_card(self, *, profile_id: UUID, card_id: UUID) -> ReviewCardState | None: ...

    async def apply_review(
        self,
        *,
        profile_id: UUID,
        card: ReviewCardState,
        command: SubmitReview,
        schedule: ReviewSchedule,
        progress: LearningStatus,
        confidence: int,
    ) -> ReviewSubmissionResult: ...


class RecallUnitOfWork(Protocol):
    repository: RecallRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...


class RecallService:
    def __init__(
        self,
        unit_of_work: Callable[[], RecallUnitOfWork],
        scheduler: ReviewScheduler,
        publisher: EventPublisher | None,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._scheduler = scheduler
        self._publisher = publisher

    async def due(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[DueReview, ...]]:
        async with self._unit_of_work() as uow:
            return await uow.repository.list_due(
                profile_id=profile_id, page=page, page_size=page_size
            )

    async def history(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[ReviewHistoryEntry, ...]]:
        async with self._unit_of_work() as uow:
            return await uow.repository.list_history(
                profile_id=profile_id, page=page, page_size=page_size
            )

    async def submit(
        self, *, profile_id: UUID, card_id: UUID, command: SubmitReview
    ) -> ReviewSubmissionResult:
        try:
            async with self._unit_of_work() as uow:
                existing = await uow.repository.find_history_event(command.review_event_id)
                if existing is not None:
                    return self._deduplicate(existing, profile_id, card_id, command)
                card = await uow.repository.load_card(profile_id=profile_id, card_id=card_id)
                if card is None:
                    raise AppError(
                        error_type="review-card-not-found",
                        title="Review card not found",
                        status=404,
                        detail="No active review card exists for this user",
                    )
                if card.row_version != command.expected_row_version:
                    self._stale()
                schedule = self._scheduler.schedule(
                    card=card, rating=command.rating, reviewed_at=command.reviewed_at
                )
                result = await uow.repository.apply_review(
                    profile_id=profile_id,
                    card=card,
                    command=command,
                    schedule=schedule,
                    progress=self._progress_for(command.rating),
                    confidence=self._confidence_for(command.rating),
                )
                await uow.commit()
        except (ReviewEventRace, StaleReviewCard):
            async with self._unit_of_work() as uow:
                existing = await uow.repository.find_history_event(command.review_event_id)
            if existing is not None:
                return self._deduplicate(existing, profile_id, card_id, command)
            self._stale()
        await self._publish(profile_id, card_id, command, result)
        return result

    @staticmethod
    def _progress_for(rating: str) -> LearningStatus:
        return {
            "again": LearningStatus.LEARNING,
            "hard": LearningStatus.ATTEMPTED,
            "good": LearningStatus.CONFIDENT,
            "easy": LearningStatus.MASTERED,
        }[rating]

    @staticmethod
    def _confidence_for(rating: str) -> int:
        return {"again": 0, "hard": 40, "good": 70, "easy": 90}[rating]

    @staticmethod
    def _deduplicate(
        existing: ReviewHistoryEntry, profile_id: UUID, card_id: UUID, command: SubmitReview
    ) -> ReviewSubmissionResult:
        if (
            existing.card_id != card_id
            or existing.rating != command.rating
            or existing.reviewed_at != command.reviewed_at
            or existing.response_time_ms != command.response_time_ms
        ):
            raise AppError(
                error_type="review-event-conflict",
                title="Review event conflict",
                status=409,
                detail="review_event_id has already been used with a different command",
            )
        return ReviewSubmissionResult(
            existing.id, card_id, existing.next_due_at, command.expected_row_version + 1, False
        )

    @staticmethod
    def _stale() -> None:
        raise AppError(
            error_type="stale-review-card-version",
            title="Review card has changed",
            status=409,
            detail="Refresh the review card before submitting",
        )

    async def _publish(
        self, profile_id: UUID, card_id: UUID, command: SubmitReview, result: ReviewSubmissionResult
    ) -> None:
        if self._publisher is None:
            return
        try:
            await self._publisher.publish(
                (
                    DomainEvent(
                        uuid4(),
                        "ReviewSubmitted",
                        command.reviewed_at,
                        {
                            "profile_id": str(profile_id),
                            "card_id": str(card_id),
                            "review_history_id": str(result.review_history_id),
                        },
                    ),
                )
            )
        except Exception:
            logger.warning("review_submitted_event_publish_failed", exc_info=True)
