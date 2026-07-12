from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel,
    ContentVersionModel,
    PublicationStatus,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    ActivityEventModel,
    UserProgressModel,
)
from recallstack.modules.practice.application.attempt_submission import (
    AttemptEventRace,
    AttemptOutcome,
    AttemptResult,
    PersistedAttempt,
    ReviewSchedule,
    SubmitPracticeAttempt,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeAttemptModel,
    PracticeOutcome,
    PracticeResourceModel,
)
from recallstack.modules.recall.infrastructure.sqlalchemy_models import ReviewCardModel
from recallstack.shared.errors import AppError

_to_persistence_outcome = {
    AttemptOutcome.SOLVED_INDEPENDENTLY: PracticeOutcome.SOLVED_INDEPENDENTLY,
    AttemptOutcome.SOLVED_WITH_HINT: PracticeOutcome.SOLVED_WITH_HINT,
    AttemptOutcome.UNDERSTOOD_BUT_COULD_NOT_CODE: PracticeOutcome.UNDERSTOOD_NOT_CODED,
    AttemptOutcome.PATTERN_NOT_IDENTIFIED: PracticeOutcome.PATTERN_NOT_IDENTIFIED,
    AttemptOutcome.SKIPPED: PracticeOutcome.SKIPPED,
}
_to_api_outcome = {value: key for key, value in _to_persistence_outcome.items()}


class SqlAlchemyPracticeAttemptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_event_id(self, attempt_event_id: UUID) -> PersistedAttempt | None:
        statement = (
            select(PracticeAttemptModel, UserProgressModel, ReviewCardModel)
            .outerjoin(
                UserProgressModel,
                and_(
                    UserProgressModel.user_id == PracticeAttemptModel.user_id,
                    UserProgressModel.content_item_id == PracticeAttemptModel.content_item_id,
                ),
            )
            .outerjoin(
                ReviewCardModel,
                and_(
                    ReviewCardModel.user_id == PracticeAttemptModel.user_id,
                    ReviewCardModel.content_item_id == PracticeAttemptModel.content_item_id,
                    ReviewCardModel.suspended_at.is_(None),
                ),
            )
            .where(PracticeAttemptModel.attempt_event_id == attempt_event_id)
        )
        row = (await self._session.execute(statement)).one_or_none()
        if row is None:
            return None
        attempt, progress, card = row
        if progress is None or card is None:
            raise RuntimeError("Practice attempt aggregate is incomplete")
        return PersistedAttempt(
            id=attempt.id,
            user_id=attempt.user_id,
            command=SubmitPracticeAttempt(
                attempt_event_id=attempt.attempt_event_id,
                content_item_id=attempt.content_item_id,
                practice_resource_id=attempt.practice_resource_id,
                outcome=_to_api_outcome[attempt.outcome],
                duration_seconds=attempt.duration_seconds,
                hint_used=attempt.hint_used,
                confidence_before=attempt.confidence_before,
                confidence_after=attempt.confidence_after,
                attempted_at=attempt.attempted_at,
            ),
            progress=progress.status,
            confidence=progress.confidence,
            review_card_id=card.id,
            next_review_at=card.due_at,
        )

    async def ensure_published_content(self, content_item_id: UUID) -> None:
        statement = (
            select(ContentItemModel.id)
            .join(
                ContentVersionModel,
                and_(
                    ContentVersionModel.id == ContentItemModel.current_published_version_id,
                    ContentVersionModel.content_item_id == ContentItemModel.id,
                ),
            )
            .where(
                ContentItemModel.id == content_item_id,
                ContentItemModel.archived_at.is_(None),
                ContentVersionModel.status == PublicationStatus.PUBLISHED,
                ContentVersionModel.published_at.is_not(None),
            )
        )
        if (await self._session.scalar(statement)) is None:
            raise AppError(
                error_type="published-content-not-found",
                title="Published content not found",
                status=404,
                detail=f"No published content exists with id '{content_item_id}'",
            )

    async def resolve_provider(
        self, *, content_item_id: UUID, practice_resource_id: UUID | None
    ) -> int:
        filters = [
            PracticeResourceModel.content_item_id == content_item_id,
            PracticeResourceModel.archived_at.is_(None),
        ]
        if practice_resource_id is None:
            filters.append(PracticeResourceModel.is_primary.is_(True))
        else:
            filters.append(PracticeResourceModel.id == practice_resource_id)
        statement = select(PracticeResourceModel.provider_id).where(*filters)
        provider_id = await self._session.scalar(statement)
        if provider_id is None:
            detail = "No active primary practice resource exists for this content"
            if practice_resource_id is not None:
                detail = "The practice resource does not belong to this content"
            raise AppError(
                error_type="invalid-practice-resource",
                title="Invalid practice resource",
                status=422,
                detail=detail,
            )
        return provider_id

    async def apply_attempt(
        self,
        *,
        profile_id: UUID,
        command: SubmitPracticeAttempt,
        provider_id: int,
        progress: LearningStatus,
        schedule: ReviewSchedule,
    ) -> AttemptResult:
        attempt = PracticeAttemptModel(
            attempt_event_id=command.attempt_event_id,
            user_id=profile_id,
            content_item_id=command.content_item_id,
            practice_resource_id=command.practice_resource_id,
            provider_id=provider_id,
            outcome=_to_persistence_outcome[command.outcome],
            duration_seconds=command.duration_seconds,
            hint_used=command.hint_used,
            confidence_before=command.confidence_before,
            confidence_after=command.confidence_after,
            attempted_at=command.attempted_at,
        )
        self._session.add(attempt)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            raise AttemptEventRace() from exc
        confidence = command.confidence_after if command.confidence_after is not None else 0
        progress_statement = (
            insert(UserProgressModel)
            .values(
                user_id=profile_id,
                content_item_id=command.content_item_id,
                status=progress,
                confidence=confidence,
                last_opened_at=command.attempted_at,
                row_version=1,
            )
            .on_conflict_do_update(
                index_elements=["user_id", "content_item_id"],
                set_={
                    "status": progress,
                    "confidence": confidence,
                    "last_opened_at": command.attempted_at,
                    "row_version": UserProgressModel.row_version + 1,
                    "updated_at": func.now(),
                },
            )
            .returning(UserProgressModel)
        )
        progress_model = await self._session.scalar(progress_statement)
        card = await self._session.scalar(
            select(ReviewCardModel).where(
                ReviewCardModel.user_id == profile_id,
                ReviewCardModel.content_item_id == command.content_item_id,
            )
        )
        if card is None:
            card = ReviewCardModel(
                user_id=profile_id,
                content_item_id=command.content_item_id,
                due_at=schedule.due_at,
                interval_days=Decimal(str(schedule.interval_days)),
            )
            self._session.add(card)
            await self._session.flush()
        else:
            card.due_at = schedule.due_at
            card.interval_days = Decimal(str(schedule.interval_days))
            card.row_version += 1
            card.updated_at = func.now()
            await self._session.flush()
        self._session.add(
            ActivityEventModel(
                user_id=profile_id,
                content_item_id=command.content_item_id,
                event_type="practice_attempt_recorded",
                source_entity_type="practice_attempt",
                source_entity_id=attempt.id,
                metadata_={
                    "outcome": command.outcome,
                    "attempt_event_id": str(command.attempt_event_id),
                },
            )
        )
        if progress_model is None:
            raise RuntimeError("Practice attempt did not update progress")
        return AttemptResult(
            attempt_id=attempt.id,
            updated_progress=progress_model.status,
            updated_confidence=progress_model.confidence,
            review_card_id=card.id,
            next_review_at=card.due_at,
            newly_applied=True,
        )
