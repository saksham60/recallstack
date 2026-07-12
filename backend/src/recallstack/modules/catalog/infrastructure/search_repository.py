# ruff: noqa: E501

from typing import cast
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.catalog.application.search import SearchFilters, SearchPort, SearchResult
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    CategoryModel,
    DomainModel,
    TopicModel,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemCategoryModel,
    ContentItemModel,
    ContentItemTopicModel,
    ContentVersionModel,
    PublicationStatus,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.sqlalchemy_models import UserProgressModel


class SqlAlchemySearchRepository(SearchPort):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search(
        self, *, profile_id: UUID, filters: SearchFilters
    ) -> tuple[int, tuple[SearchResult, ...]]:
        rank = func.ts_rank_cd(
            ContentVersionModel.search_document, func.websearch_to_tsquery("english", filters.q)
        )
        topic_match = (
            select(TopicModel.name)
            .join(
                ContentItemTopicModel,
                and_(
                    ContentItemTopicModel.topic_id == TopicModel.id,
                    ContentItemTopicModel.domain_id == TopicModel.domain_id,
                ),
            )
            .where(ContentItemTopicModel.content_item_id == ContentItemModel.id)
            .order_by(ContentItemTopicModel.is_primary.desc(), TopicModel.name)
            .limit(1)
            .scalar_subquery()
        )
        category_match = (
            select(CategoryModel.name)
            .join(
                ContentItemCategoryModel,
                and_(
                    ContentItemCategoryModel.category_id == CategoryModel.id,
                    ContentItemCategoryModel.domain_id == CategoryModel.domain_id,
                ),
            )
            .where(ContentItemCategoryModel.content_item_id == ContentItemModel.id)
            .order_by(CategoryModel.name)
            .limit(1)
            .scalar_subquery()
        )
        statement = (
            select(
                ContentItemModel.id,
                ContentItemModel.slug,
                ContentVersionModel.title,
                ContentVersionModel.summary,
                ContentItemModel.type,
                ContentItemModel.difficulty,
                topic_match.label("matched_topic"),
                category_match.label("matched_category"),
                func.coalesce(UserProgressModel.status, LearningStatus.NEW),
                func.coalesce(UserProgressModel.confidence, 0),
                rank.label("rank"),
            )
            .join(
                ContentVersionModel,
                and_(
                    ContentVersionModel.id == ContentItemModel.current_published_version_id,
                    ContentVersionModel.content_item_id == ContentItemModel.id,
                ),
            )
            .join(DomainModel, DomainModel.id == ContentItemModel.domain_id)
            .outerjoin(
                UserProgressModel,
                and_(
                    UserProgressModel.content_item_id == ContentItemModel.id,
                    UserProgressModel.user_id == profile_id,
                ),
            )
            .where(
                ContentItemModel.archived_at.is_(None),
                ContentVersionModel.status == PublicationStatus.PUBLISHED,
                ContentVersionModel.published_at.is_not(None),
            )
        )
        if filters.q.strip():
            query = func.websearch_to_tsquery("english", filters.q.strip())
            title_trigram = ContentVersionModel.title.op("%")(filters.q.strip())
            statement = statement.where(
                or_(ContentVersionModel.search_document.op("@@")(query), title_trigram)
            )
        if filters.domain:
            statement = statement.where(DomainModel.slug == filters.domain)
        if filters.category:
            statement = statement.where(
                select(ContentItemCategoryModel.content_item_id)
                .join(
                    CategoryModel,
                    and_(
                        CategoryModel.id == ContentItemCategoryModel.category_id,
                        CategoryModel.domain_id == ContentItemCategoryModel.domain_id,
                    ),
                )
                .where(
                    ContentItemCategoryModel.content_item_id == ContentItemModel.id,
                    CategoryModel.slug == filters.category,
                )
                .exists()
            )
        if filters.topic:
            statement = statement.where(
                select(ContentItemTopicModel.content_item_id)
                .join(
                    TopicModel,
                    and_(
                        TopicModel.id == ContentItemTopicModel.topic_id,
                        TopicModel.domain_id == ContentItemTopicModel.domain_id,
                    ),
                )
                .where(
                    ContentItemTopicModel.content_item_id == ContentItemModel.id,
                    TopicModel.slug == filters.topic,
                )
                .exists()
            )
        if filters.content_type:
            statement = statement.where(ContentItemModel.type == filters.content_type)
        if filters.difficulty:
            statement = statement.where(ContentItemModel.difficulty == filters.difficulty)
        count = int(
            (
                await self._session.scalar(
                    select(func.count()).select_from(statement.order_by(None).subquery())
                )
            )
            or 0
        )
        if not filters.q.strip():
            statement = statement.order_by(ContentVersionModel.title, ContentItemModel.id)
        else:
            statement = statement.order_by(
                rank.desc(), ContentVersionModel.title, ContentItemModel.id
            )
        rows = await self._session.execute(
            statement.limit(filters.page_size).offset((filters.page - 1) * filters.page_size)
        )
        return count, tuple(
            SearchResult(
                content_id,
                slug,
                title,
                summary,
                cast(str, content_type),
                cast(str | None, difficulty),
                matched_topic,
                matched_category,
                status,
                confidence,
                float(result_rank or 0),
            )
            for content_id, slug, title, summary, content_type, difficulty, matched_topic, matched_category, status, confidence, result_rank in rows
        )
