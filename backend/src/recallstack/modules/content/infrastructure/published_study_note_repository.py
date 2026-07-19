from collections.abc import Iterable, Mapping
from datetime import datetime
from decimal import Decimal
from typing import cast
from uuid import UUID

from sqlalchemy import and_, case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    CategoryModel,
    DomainModel,
    TopicModel,
)
from recallstack.modules.content.application.published_study_note import (
    PublishedStudyNote,
    StudyNoteBlock,
    StudyNoteCategory,
    StudyNoteContentReference,
    StudyNoteDomain,
    StudyNotePracticeResource,
    StudyNoteReviewCard,
    StudyNoteTopic,
    StudyNoteUserProgress,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentBlockModel,
    ContentItemModel,
    ContentRelationModel,
    ContentRelationType,
    ContentVersionBlockModel,
    ContentVersionCategoryModel,
    ContentVersionModel,
    ContentVersionTopicModel,
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
from recallstack.shared.errors import AppError


class SqlAlchemyPublishedStudyNoteReadRepository:
    """Loads a published study note with a bounded, section-oriented query plan."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_published_document(
        self, *, slug: str, profile_id: UUID
    ) -> PublishedStudyNote | None:
        document_rows = (
            (
                await self._session.execute(
                    self._document_statement(slug=slug, profile_id=profile_id)
                )
            )
            .mappings()
            .all()
        )
        if not document_rows:
            return None
        if len(document_rows) > 1:
            raise AppError(
                error_type="ambiguous-content-slug",
                title="Ambiguous content slug",
                status=409,
                detail="The requested slug exists in more than one domain",
            )
        document = document_rows[0]
        content_item_id = cast(UUID, document["content_item_id"])
        version_id = cast(UUID, document["version_id"])
        categories = await self._categories(version_id)
        topics = await self._topics(version_id)
        blocks = await self._blocks(version_id)
        related_content = await self._related_content(content_item_id)
        prerequisites = await self._prerequisites(content_item_id)
        practice_resources = await self._practice_resources(content_item_id)
        return self._to_note(
            document,
            categories=categories,
            topics=topics,
            blocks=blocks,
            related_content=related_content,
            prerequisites=prerequisites,
            practice_resources=practice_resources,
        )

    @staticmethod
    def _document_statement(*, slug: str, profile_id: UUID):  # type: ignore[no-untyped-def]
        return (
            select(
                ContentItemModel.id.label("content_item_id"),
                ContentItemModel.slug,
                ContentItemModel.type,
                ContentItemModel.difficulty,
                ContentVersionModel.id.label("version_id"),
                ContentVersionModel.version_number,
                ContentVersionModel.title,
                ContentVersionModel.summary,
                DomainModel.id.label("domain_id"),
                DomainModel.slug.label("domain_slug"),
                DomainModel.name.label("domain_name"),
                UserProgressModel.status.label("progress_status"),
                UserProgressModel.confidence.label("progress_confidence"),
                UserProgressModel.last_opened_at,
                BookmarkModel.content_item_id.label("bookmark_content_item_id"),
                ReviewCardModel.due_at.label("review_due_at"),
                ReviewCardModel.interval_days.label("review_interval_days"),
                ReviewCardModel.review_count,
                ReviewCardModel.lapse_count,
                ReviewCardModel.last_reviewed_at,
            )
            .select_from(ContentItemModel)
            .join(DomainModel, DomainModel.id == ContentItemModel.domain_id)
            .join(
                ContentVersionModel,
                and_(
                    ContentVersionModel.id == ContentItemModel.current_published_version_id,
                    ContentVersionModel.content_item_id == ContentItemModel.id,
                ),
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
                ContentItemModel.slug == slug,
                ContentItemModel.archived_at.is_(None),
                ContentVersionModel.status == PublicationStatus.PUBLISHED,
                ContentVersionModel.published_at.is_not(None),
            )
        )

    async def _categories(self, version_id: UUID) -> tuple[StudyNoteCategory, ...]:
        statement = (
            select(
                CategoryModel.id,
                CategoryModel.slug,
                CategoryModel.name,
                ContentVersionCategoryModel.sort_order,
            )
            .select_from(ContentVersionCategoryModel)
            .join(
                CategoryModel,
                and_(
                    CategoryModel.id == ContentVersionCategoryModel.category_id,
                    CategoryModel.domain_id == ContentVersionCategoryModel.domain_id,
                ),
            )
            .where(ContentVersionCategoryModel.content_version_id == version_id)
            .order_by(ContentVersionCategoryModel.sort_order, CategoryModel.name, CategoryModel.id)
        )
        return tuple(
            StudyNoteCategory(id=category_id, slug=slug, name=name, sort_order=sort_order)
            for category_id, slug, name, sort_order in await self._session.execute(statement)
        )

    async def _topics(self, version_id: UUID) -> tuple[StudyNoteTopic, ...]:
        statement = (
            select(
                TopicModel.id,
                TopicModel.slug,
                TopicModel.name,
                TopicModel.kind,
                ContentVersionTopicModel.is_primary,
                ContentVersionTopicModel.sort_order,
            )
            .select_from(ContentVersionTopicModel)
            .join(
                TopicModel,
                and_(
                    TopicModel.id == ContentVersionTopicModel.topic_id,
                    TopicModel.domain_id == ContentVersionTopicModel.domain_id,
                ),
            )
            .where(ContentVersionTopicModel.content_version_id == version_id)
            .order_by(
                ContentVersionTopicModel.is_primary.desc(),
                ContentVersionTopicModel.sort_order,
                TopicModel.name,
                TopicModel.id,
            )
        )
        return tuple(
            StudyNoteTopic(
                id=topic_id,
                slug=slug,
                name=name,
                kind=cast(str, kind),
                is_primary=is_primary,
                sort_order=sort_order,
            )
            for topic_id, slug, name, kind, is_primary, sort_order in await self._session.execute(
                statement
            )
        )

    async def _blocks(self, version_id: UUID) -> tuple[StudyNoteBlock, ...]:
        statement = (
            select(
                ContentBlockModel.id,
                ContentBlockModel.type,
                ContentVersionBlockModel.heading,
                ContentVersionBlockModel.position,
                ContentBlockModel.payload,
            )
            .select_from(ContentVersionBlockModel)
            .join(
                ContentBlockModel,
                ContentBlockModel.id == ContentVersionBlockModel.content_block_id,
            )
            .where(ContentVersionBlockModel.content_version_id == version_id)
            .order_by(ContentVersionBlockModel.position, ContentBlockModel.id)
        )
        rows = await self._session.execute(statement)
        return tuple(
            StudyNoteBlock(
                id=block_id,
                type=cast(str, block_type),
                heading=heading,
                position=position,
                payload=payload,
            )
            for block_id, block_type, heading, position, payload in rows
        )

    async def _related_content(
        self, content_item_id: UUID
    ) -> tuple[StudyNoteContentReference, ...]:
        referenced_item = aliased(ContentItemModel)
        referenced_version = aliased(ContentVersionModel)
        related_id = case(
            (
                ContentRelationModel.source_content_item_id == content_item_id,
                ContentRelationModel.target_content_item_id,
            ),
            else_=ContentRelationModel.source_content_item_id,
        )
        statement = (
            select(
                referenced_item.id,
                referenced_item.slug,
                referenced_item.type,
                referenced_item.difficulty,
                referenced_version.title,
                referenced_version.summary,
                ContentRelationModel.relation_type,
                ContentRelationModel.sort_order,
            )
            .select_from(ContentRelationModel)
            .join(referenced_item, referenced_item.id == related_id)
            .join(
                referenced_version,
                and_(
                    referenced_version.id == referenced_item.current_published_version_id,
                    referenced_version.content_item_id == referenced_item.id,
                ),
            )
            .where(
                ContentRelationModel.relation_type.in_(
                    (ContentRelationType.RELATED, ContentRelationType.ALTERNATIVE)
                ),
                or_(
                    ContentRelationModel.source_content_item_id == content_item_id,
                    ContentRelationModel.target_content_item_id == content_item_id,
                ),
                referenced_item.archived_at.is_(None),
                referenced_version.status == PublicationStatus.PUBLISHED,
                referenced_version.published_at.is_not(None),
            )
            .order_by(ContentRelationModel.sort_order, referenced_version.title, referenced_item.id)
        )
        return self._references(await self._session.execute(statement))

    async def _prerequisites(self, content_item_id: UUID) -> tuple[StudyNoteContentReference, ...]:
        referenced_item = aliased(ContentItemModel)
        referenced_version = aliased(ContentVersionModel)
        statement = (
            select(
                referenced_item.id,
                referenced_item.slug,
                referenced_item.type,
                referenced_item.difficulty,
                referenced_version.title,
                referenced_version.summary,
                ContentRelationModel.relation_type,
                ContentRelationModel.sort_order,
            )
            .select_from(ContentRelationModel)
            .join(
                referenced_item,
                referenced_item.id == ContentRelationModel.target_content_item_id,
            )
            .join(
                referenced_version,
                and_(
                    referenced_version.id == referenced_item.current_published_version_id,
                    referenced_version.content_item_id == referenced_item.id,
                ),
            )
            .where(
                ContentRelationModel.source_content_item_id == content_item_id,
                ContentRelationModel.relation_type == ContentRelationType.PREREQUISITE,
                referenced_item.archived_at.is_(None),
                referenced_version.status == PublicationStatus.PUBLISHED,
                referenced_version.published_at.is_not(None),
            )
            .order_by(ContentRelationModel.sort_order, referenced_version.title, referenced_item.id)
        )
        return self._references(await self._session.execute(statement))

    async def _practice_resources(
        self, content_item_id: UUID
    ) -> tuple[StudyNotePracticeResource, ...]:
        statement = (
            select(
                PracticeResourceModel.id,
                PracticeProviderModel.slug,
                PracticeProviderModel.name,
                PracticeResourceModel.external_key,
                PracticeResourceModel.title,
                PracticeResourceModel.url,
                PracticeResourceModel.is_primary,
                PracticeResourceModel.sort_order,
            )
            .select_from(PracticeResourceModel)
            .join(
                PracticeProviderModel,
                PracticeProviderModel.id == PracticeResourceModel.provider_id,
            )
            .where(
                PracticeResourceModel.content_item_id == content_item_id,
                PracticeResourceModel.archived_at.is_(None),
            )
            .order_by(
                PracticeResourceModel.is_primary.desc(),
                PracticeResourceModel.sort_order,
                PracticeProviderModel.name,
                PracticeResourceModel.id,
            )
        )
        return tuple(
            StudyNotePracticeResource(
                id=resource_id,
                provider_slug=provider_slug,
                provider_name=provider_name,
                external_key=external_key,
                title=title,
                url=url,
                is_primary=is_primary,
                sort_order=sort_order,
            )
            for (
                resource_id,
                provider_slug,
                provider_name,
                external_key,
                title,
                url,
                is_primary,
                sort_order,
            ) in await self._session.execute(statement)
        )

    @staticmethod
    def _references(rows: object) -> tuple[StudyNoteContentReference, ...]:
        return tuple(
            StudyNoteContentReference(
                content_item_id=content_item_id,
                slug=slug,
                type=cast(str, content_type),
                difficulty=cast(str | None, difficulty),
                title=title,
                summary=summary,
                relation_type=cast(str, relation_type),
                sort_order=sort_order,
            )
            for (
                content_item_id,
                slug,
                content_type,
                difficulty,
                title,
                summary,
                relation_type,
                sort_order,
            ) in cast(
                Iterable[tuple[UUID, str, object, object, str, str | None, object, int]], rows
            )
        )

    @staticmethod
    def _to_note(
        document: object,
        *,
        categories: tuple[StudyNoteCategory, ...],
        topics: tuple[StudyNoteTopic, ...],
        blocks: tuple[StudyNoteBlock, ...],
        related_content: tuple[StudyNoteContentReference, ...],
        prerequisites: tuple[StudyNoteContentReference, ...],
        practice_resources: tuple[StudyNotePracticeResource, ...],
    ) -> PublishedStudyNote:
        values = cast(Mapping[str, object], document)
        review_due_at = values["review_due_at"]
        interval_days = cast(Decimal | None, values["review_interval_days"])
        review_card = (
            StudyNoteReviewCard(
                due_at=cast(datetime, review_due_at),
                interval_days=float(interval_days or Decimal(0)),
                review_count=cast(int, values["review_count"]),
                lapse_count=cast(int, values["lapse_count"]),
                last_reviewed_at=cast(datetime | None, values["last_reviewed_at"]),
            )
            if review_due_at is not None
            else None
        )
        status = cast(LearningStatus | None, values["progress_status"]) or LearningStatus.NEW
        return PublishedStudyNote(
            content_item_id=cast(UUID, values["content_item_id"]),
            slug=cast(str, values["slug"]),
            domain=StudyNoteDomain(
                id=cast(UUID, values["domain_id"]),
                slug=cast(str, values["domain_slug"]),
                name=cast(str, values["domain_name"]),
            ),
            categories=categories,
            topics=topics,
            primary_topic=next((topic for topic in topics if topic.is_primary), None),
            type=cast(str, values["type"]),
            difficulty=cast(str | None, values["difficulty"]),
            published_version_number=cast(int, values["version_number"]),
            title=cast(str, values["title"]),
            summary=cast(str | None, values["summary"]),
            blocks=blocks,
            related_content=related_content,
            prerequisites=prerequisites,
            practice_resources=practice_resources,
            user_progress=StudyNoteUserProgress(
                status=status,
                confidence=cast(int | None, values["progress_confidence"]) or 0,
                last_opened_at=cast(datetime | None, values["last_opened_at"]),
            ),
            is_bookmarked=values["bookmark_content_item_id"] is not None,
            review_card=review_card,
        )
