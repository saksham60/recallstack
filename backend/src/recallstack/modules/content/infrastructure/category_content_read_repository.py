from collections.abc import Mapping
from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.catalog.infrastructure.sqlalchemy_models import CategoryModel, TopicModel
from recallstack.modules.content.application.category_content_list import (
    CategoryContentListFilters,
    CategoryContentListItem,
    ContentUserProgress,
    PrimaryPracticeResource,
    PrimaryTopic,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel,
    ContentType,
    ContentVersionCategoryModel,
    ContentVersionModel,
    ContentVersionTopicModel,
    DifficultyLevel,
    PublicationStatus,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    BookmarkModel,
    UserProgressModel,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeProviderModel,
    PracticeResourceModel,
)
from recallstack.modules.recall.infrastructure.sqlalchemy_models import ReviewCardModel


class SqlAlchemyCategoryContentReadRepository:
    """Content-owned read model composed in a fixed number of SQL queries."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def category_exists(self, category_id: UUID) -> bool:
        statement = select(CategoryModel.id).where(
            CategoryModel.id == category_id,
            CategoryModel.is_active.is_(True),
        )
        return (await self._session.scalar(statement)) is not None

    async def list_published_content(
        self,
        *,
        category_id: UUID,
        profile_id: UUID,
        filters: CategoryContentListFilters,
    ) -> tuple[int, tuple[CategoryContentListItem, ...]]:
        statement = self._statement(
            category_id=category_id,
            profile_id=profile_id,
            filters=filters,
        )
        count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
        total_items = int((await self._session.scalar(count_statement)) or 0)
        rows = (
            await self._session.execute(
                statement.limit(filters.page_size).offset((filters.page - 1) * filters.page_size)
            )
        ).mappings()
        return total_items, tuple(self._to_item(row) for row in rows)

    @staticmethod
    def _statement(  # type: ignore[no-untyped-def]
        *, category_id: UUID, profile_id: UUID, filters: CategoryContentListFilters
    ):
        statement = (
            select(
                ContentItemModel.id.label("content_item_id"),
                ContentItemModel.slug,
                ContentItemModel.type,
                ContentItemModel.difficulty,
                ContentItemModel.updated_at,
                ContentVersionCategoryModel.sort_order.label("category_sort_order"),
                ContentVersionModel.title,
                ContentVersionModel.summary,
                TopicModel.slug.label("topic_slug"),
                TopicModel.name.label("topic_name"),
                PracticeResourceModel.id.label("practice_resource_id"),
                PracticeResourceModel.title.label("practice_resource_title"),
                PracticeResourceModel.url.label("practice_resource_url"),
                PracticeProviderModel.slug.label("practice_provider_slug"),
                PracticeProviderModel.name.label("practice_provider_name"),
                UserProgressModel.status.label("progress_status"),
                UserProgressModel.confidence.label("progress_confidence"),
                UserProgressModel.last_opened_at,
                BookmarkModel.content_item_id.label("bookmark_content_item_id"),
                ReviewCardModel.due_at.label("next_review_at"),
            )
            .select_from(ContentVersionCategoryModel)
            .join(
                CategoryModel,
                and_(
                    CategoryModel.id == ContentVersionCategoryModel.category_id,
                    CategoryModel.domain_id == ContentVersionCategoryModel.domain_id,
                ),
            )
            .join(
                ContentItemModel,
                and_(
                    ContentItemModel.id == ContentVersionCategoryModel.content_item_id,
                    ContentItemModel.domain_id == ContentVersionCategoryModel.domain_id,
                ),
            )
            .join(
                ContentVersionModel,
                and_(
                    ContentVersionModel.id == ContentItemModel.current_published_version_id,
                    ContentVersionModel.content_item_id == ContentItemModel.id,
                    ContentVersionCategoryModel.content_version_id == ContentVersionModel.id,
                ),
            )
            .outerjoin(
                ContentVersionTopicModel,
                and_(
                    ContentVersionTopicModel.content_version_id == ContentVersionModel.id,
                    ContentVersionTopicModel.content_item_id == ContentItemModel.id,
                    ContentVersionTopicModel.domain_id == ContentItemModel.domain_id,
                    ContentVersionTopicModel.is_primary.is_(True),
                ),
            )
            .outerjoin(
                TopicModel,
                and_(
                    TopicModel.id == ContentVersionTopicModel.topic_id,
                    TopicModel.domain_id == ContentVersionTopicModel.domain_id,
                ),
            )
            .outerjoin(
                PracticeResourceModel,
                and_(
                    PracticeResourceModel.content_item_id == ContentItemModel.id,
                    PracticeResourceModel.is_primary.is_(True),
                    PracticeResourceModel.archived_at.is_(None),
                ),
            )
            .outerjoin(
                PracticeProviderModel,
                PracticeProviderModel.id == PracticeResourceModel.provider_id,
            )
            .outerjoin(
                UserProgressModel,
                and_(
                    UserProgressModel.content_item_id == ContentItemModel.id,
                    UserProgressModel.user_id == profile_id,
                ),
            )
            .outerjoin(
                BookmarkModel,
                and_(
                    BookmarkModel.content_item_id == ContentItemModel.id,
                    BookmarkModel.user_id == profile_id,
                ),
            )
            .outerjoin(
                ReviewCardModel,
                and_(
                    ReviewCardModel.content_item_id == ContentItemModel.id,
                    ReviewCardModel.user_id == profile_id,
                    ReviewCardModel.suspended_at.is_(None),
                ),
            )
            .where(
                ContentVersionCategoryModel.category_id == category_id,
                CategoryModel.is_active.is_(True),
                ContentItemModel.archived_at.is_(None),
                ContentVersionModel.status == PublicationStatus.PUBLISHED,
                ContentVersionModel.published_at.is_not(None),
            )
        )
        if filters.content_type is not None:
            statement = statement.where(ContentItemModel.type == ContentType(filters.content_type))
        if filters.difficulty is not None:
            statement = statement.where(
                ContentItemModel.difficulty == DifficultyLevel(filters.difficulty)
            )
        if filters.status is not None:
            if filters.status is LearningStatus.NEW:
                statement = statement.where(
                    or_(
                        UserProgressModel.status == LearningStatus.NEW,
                        UserProgressModel.content_item_id.is_(None),
                    )
                )
            else:
                statement = statement.where(UserProgressModel.status == filters.status)
        if filters.topic_slug is not None:
            statement = statement.where(
                select(ContentVersionTopicModel.content_item_id)
                .join(
                    TopicModel,
                    and_(
                        TopicModel.id == ContentVersionTopicModel.topic_id,
                        TopicModel.domain_id == ContentVersionTopicModel.domain_id,
                    ),
                )
                .where(
                    ContentVersionTopicModel.content_version_id == ContentVersionModel.id,
                    ContentVersionTopicModel.content_item_id == ContentItemModel.id,
                    TopicModel.slug == filters.topic_slug,
                )
                .exists()
            )
        if filters.search is not None:
            pattern = f"%{filters.search.strip()}%"
            statement = statement.where(
                or_(
                    ContentVersionModel.title.ilike(pattern),
                    ContentVersionModel.summary.ilike(pattern),
                    ContentItemModel.slug.ilike(pattern),
                )
            )
        if filters.sort == "title":
            return statement.order_by(ContentVersionModel.title.asc(), ContentItemModel.id.asc())
        if filters.sort == "difficulty":
            return statement.order_by(
                ContentItemModel.difficulty.asc().nulls_last(),
                ContentVersionModel.title.asc(),
                ContentItemModel.id.asc(),
            )
        if filters.sort == "updated_at":
            return statement.order_by(ContentItemModel.updated_at.desc(), ContentItemModel.id.asc())
        return statement.order_by(
            ContentVersionCategoryModel.sort_order.asc(),
            ContentVersionModel.title.asc(),
            ContentItemModel.id.asc(),
        )

    @staticmethod
    def _to_item(row: object) -> CategoryContentListItem:
        values = cast(Mapping[str, object], row)
        topic = (
            PrimaryTopic(slug=cast(str, values["topic_slug"]), name=cast(str, values["topic_name"]))
            if values["topic_slug"] is not None
            else None
        )
        resource = (
            PrimaryPracticeResource(
                id=cast(UUID, values["practice_resource_id"]),
                provider_slug=cast(str, values["practice_provider_slug"]),
                provider_name=cast(str, values["practice_provider_name"]),
                title=cast(str | None, values["practice_resource_title"]),
                url=cast(str, values["practice_resource_url"]),
            )
            if values["practice_resource_id"] is not None
            else None
        )
        status = cast(LearningStatus | None, values["progress_status"]) or LearningStatus.NEW
        confidence = cast(int | None, values["progress_confidence"]) or 0
        return CategoryContentListItem(
            content_item_id=cast(UUID, values["content_item_id"]),
            slug=cast(str, values["slug"]),
            type=cast(str, values["type"]),
            title=cast(str, values["title"]),
            summary=cast(str | None, values["summary"]),
            difficulty=cast(str | None, values["difficulty"]),
            primary_topic=topic,
            primary_practice_resource=resource,
            user_progress=ContentUserProgress(status=status, confidence=confidence),
            is_bookmarked=values["bookmark_content_item_id"] is not None,
            last_opened_at=cast(datetime | None, values["last_opened_at"]),
            next_review_at=cast(datetime | None, values["next_review_at"]),
        )
