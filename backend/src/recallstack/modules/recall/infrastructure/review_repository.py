# ruff: noqa: E501

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import cast
from uuid import UUID

from sqlalchemy import and_, func, select, update
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
from recallstack.modules.recall.application.review_submission import (
    DueReview,
    RecallRepository,
    ReviewCardState,
    ReviewEventRace,
    ReviewHistoryEntry,
    ReviewSchedule,
    ReviewSubmissionResult,
    ScheduledReview,
    StaleReviewCard,
    SubmitReview,
)
from recallstack.modules.recall.infrastructure.sqlalchemy_models import (
    ReviewCardModel,
    ReviewHistoryModel,
    ReviewRating,
)
from recallstack.modules.sync.infrastructure.sqlalchemy_models import (
    ChangeOperation,
    UserSyncChangeLogModel,
    UserSyncCounterModel,
)


class SqlAlchemyRecallRepository(RecallRepository):
    def __init__(self, session: AsyncSession, *, sync_retention_days: int = 30) -> None:
        self._session = session
        self._sync_retention_days = sync_retention_days

    async def list_due(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[DueReview, ...]]:
        filters = (
            ReviewCardModel.user_id == profile_id,
            ReviewCardModel.suspended_at.is_(None),
            ReviewCardModel.due_at <= func.now(),
            ContentItemModel.archived_at.is_(None),
            ContentVersionModel.status == PublicationStatus.PUBLISHED,
            ContentVersionModel.published_at.is_not(None),
        )
        source = ReviewCardModel.__table__.join(
            ContentItemModel.__table__, ContentItemModel.id == ReviewCardModel.content_item_id
        ).join(
            ContentVersionModel.__table__,
            and_(
                ContentVersionModel.id == ContentItemModel.current_published_version_id,
                ContentVersionModel.content_item_id == ContentItemModel.id,
            ),
        )
        total = int(
            (await self._session.scalar(select(func.count()).select_from(source).where(*filters)))
            or 0
        )
        statement = (
            select(
                ReviewCardModel.id,
                ReviewCardModel.due_at,
                ReviewCardModel.row_version,
                ContentItemModel.id,
                ContentItemModel.slug,
                ContentVersionModel.title,
                ContentVersionModel.summary,
                ContentItemModel.type,
                ContentItemModel.difficulty,
            )
            .select_from(source)
            .where(*filters)
            .order_by(ReviewCardModel.due_at, ReviewCardModel.id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        return total, tuple(
            DueReview(
                card_id,
                due_at,
                version,
                content_id,
                slug,
                title,
                summary,
                cast(str, item_type),
                cast(str | None, difficulty),
            )
            for card_id, due_at, version, content_id, slug, title, summary, item_type, difficulty in await self._session.execute(
                statement
            )
        )

    async def list_scheduled(
        self,
        *,
        profile_id: UUID,
        page: int,
        page_size: int,
        due_after: datetime | None,
        due_before: datetime | None,
        state: str | None,
    ) -> tuple[int, tuple[ScheduledReview, ...]]:
        now = datetime.now(UTC)
        filters = [
            ReviewCardModel.user_id == profile_id,
            ReviewCardModel.suspended_at.is_(None),
            ContentItemModel.archived_at.is_(None),
            ContentVersionModel.status == PublicationStatus.PUBLISHED,
            ContentVersionModel.published_at.is_not(None),
        ]
        if due_after is not None:
            filters.append(ReviewCardModel.due_at >= due_after)
        if due_before is not None:
            filters.append(ReviewCardModel.due_at <= due_before)
        if state == "due":
            filters.append(ReviewCardModel.due_at <= now)
        elif state == "scheduled":
            filters.append(ReviewCardModel.due_at > now)
        source = ReviewCardModel.__table__.join(
            ContentItemModel.__table__,
            ContentItemModel.id == ReviewCardModel.content_item_id,
        ).join(
            ContentVersionModel.__table__,
            and_(
                ContentVersionModel.id == ContentItemModel.current_published_version_id,
                ContentVersionModel.content_item_id == ContentItemModel.id,
            ),
        )
        total = int(
            await self._session.scalar(select(func.count()).select_from(source).where(*filters))
            or 0
        )
        cards = (
            await self._session.scalars(
                select(ReviewCardModel)
                .select_from(source)
                .where(*filters)
                .order_by(ReviewCardModel.due_at, ReviewCardModel.id)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        return total, tuple(
            ScheduledReview(
                card.id,
                card.content_item_id,
                "due" if card.due_at <= now else "scheduled",
                card.due_at,
                card.row_version,
                card.created_at,
                card.updated_at,
            )
            for card in cards
        )

    async def list_history(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[ReviewHistoryEntry, ...]]:
        filters = (ReviewHistoryModel.user_id == profile_id,)
        total = int(
            (
                await self._session.scalar(
                    select(func.count()).where(*filters).select_from(ReviewHistoryModel)
                )
            )
            or 0
        )
        statement = (
            select(ReviewHistoryModel, ReviewCardModel.content_item_id)
            .join(
                ReviewCardModel,
                and_(
                    ReviewCardModel.id == ReviewHistoryModel.review_card_id,
                    ReviewCardModel.user_id == ReviewHistoryModel.user_id,
                ),
            )
            .where(*filters)
            .order_by(ReviewHistoryModel.reviewed_at.desc(), ReviewHistoryModel.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        return total, tuple(
            self._history(history, content_id)
            for history, content_id in await self._session.execute(statement)
        )

    async def find_history_event(
        self, *, profile_id: UUID, review_event_id: UUID
    ) -> ReviewHistoryEntry | None:
        statement = (
            select(ReviewHistoryModel, ReviewCardModel.content_item_id)
            .join(
                ReviewCardModel,
                and_(
                    ReviewCardModel.id == ReviewHistoryModel.review_card_id,
                    ReviewCardModel.user_id == ReviewHistoryModel.user_id,
                ),
            )
            .where(
                ReviewHistoryModel.review_event_id == review_event_id,
                ReviewHistoryModel.user_id == profile_id,
            )
        )
        row = (await self._session.execute(statement)).one_or_none()
        return self._history(*row) if row is not None else None

    async def load_card(self, *, profile_id: UUID, card_id: UUID) -> ReviewCardState | None:
        card = await self._session.scalar(
            select(ReviewCardModel).where(
                ReviewCardModel.id == card_id,
                ReviewCardModel.user_id == profile_id,
                ReviewCardModel.suspended_at.is_(None),
            )
        )
        if card is None:
            return None
        return ReviewCardState(
            card.id,
            card.content_item_id,
            card.due_at,
            float(card.interval_days),
            card.review_count,
            card.lapse_count,
            card.row_version,
            card.scheduler_name,
            card.scheduler_version,
            card.scheduler_state,
        )

    async def apply_review(
        self,
        *,
        profile_id: UUID,
        card: ReviewCardState,
        command: SubmitReview,
        schedule: ReviewSchedule,
        progress: LearningStatus,
        confidence: int,
    ) -> ReviewSubmissionResult:
        statement = (
            update(ReviewCardModel)
            .where(
                ReviewCardModel.id == card.id,
                ReviewCardModel.user_id == profile_id,
                ReviewCardModel.suspended_at.is_(None),
                ReviewCardModel.row_version == command.expected_row_version,
            )
            .values(
                due_at=schedule.due_at,
                interval_days=Decimal(str(schedule.interval_days)),
                scheduler_name=schedule.scheduler_name,
                scheduler_version=schedule.scheduler_version,
                scheduler_state=schedule.scheduler_state,
                review_count=ReviewCardModel.review_count + 1,
                lapse_count=ReviewCardModel.lapse_count + (1 if command.rating == "again" else 0),
                last_reviewed_at=command.reviewed_at,
                row_version=ReviewCardModel.row_version + 1,
                updated_at=func.now(),
            )
            .returning(ReviewCardModel)
        )
        updated = await self._session.scalar(statement)
        if updated is None:
            raise StaleReviewCard()
        history = ReviewHistoryModel(
            review_event_id=command.review_event_id,
            review_card_id=card.id,
            user_id=profile_id,
            rating=ReviewRating(command.rating),
            reviewed_at=command.reviewed_at,
            response_time_ms=command.response_time_ms,
            previous_due_at=card.due_at,
            next_due_at=schedule.due_at,
            interval_days_after=Decimal(str(schedule.interval_days)),
            scheduler_name=schedule.scheduler_name,
            scheduler_version=schedule.scheduler_version,
            scheduler_state_after=schedule.scheduler_state,
        )
        self._session.add(history)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            raise ReviewEventRace() from exc
        progress_statement = (
            insert(UserProgressModel)
            .values(
                user_id=profile_id,
                content_item_id=card.content_item_id,
                status=progress,
                confidence=confidence,
                row_version=1,
            )
            .on_conflict_do_update(
                index_elements=["user_id", "content_item_id"],
                set_={
                    "status": progress,
                    "confidence": confidence,
                    "row_version": UserProgressModel.row_version + 1,
                    "updated_at": func.now(),
                },
            )
        )
        await self._session.execute(progress_statement)
        self._session.add(
            ActivityEventModel(
                user_id=profile_id,
                content_item_id=card.content_item_id,
                event_type="review_submitted",
                source_entity_type="review_history",
                source_entity_id=None,
                metadata_={
                    "rating": command.rating,
                    "review_event_id": str(command.review_event_id),
                },
            )
        )
        await self._session.execute(
            insert(UserSyncCounterModel)
            .values(user_id=profile_id, last_cursor=0)
            .on_conflict_do_nothing(index_elements=[UserSyncCounterModel.user_id])
        )
        counter = await self._session.scalar(
            select(UserSyncCounterModel)
            .where(UserSyncCounterModel.user_id == profile_id)
            .with_for_update()
        )
        if counter is None:
            raise RuntimeError("User sync counter could not be created")
        counter.last_cursor += 1
        counter.updated_at = datetime.now(UTC)
        self._session.add(
            UserSyncChangeLogModel(
                user_id=profile_id,
                cursor=counter.last_cursor,
                entity_type="review",
                entity_id=card.id,
                operation=ChangeOperation.UPSERT,
                entity_version=updated.row_version,
                retain_until=datetime.now(UTC) + timedelta(days=self._sync_retention_days),
            )
        )
        await self._session.flush()
        return ReviewSubmissionResult(
            history.id,
            card.id,
            schedule.due_at,
            updated.row_version,
            True,
            counter.last_cursor,
        )

    @staticmethod
    def _history(history: ReviewHistoryModel, content_item_id: UUID) -> ReviewHistoryEntry:
        return ReviewHistoryEntry(
            history.id,
            history.review_event_id,
            history.review_card_id,
            content_item_id,
            cast(str, history.rating),
            history.reviewed_at,
            history.response_time_ms,
            history.previous_due_at,
            history.next_due_at,
            float(history.interval_days_after) if history.interval_days_after is not None else None,
            history.scheduler_name,
            history.scheduler_version,
        )
