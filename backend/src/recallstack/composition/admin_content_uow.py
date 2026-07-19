from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self
from uuid import UUID

from sqlalchemy import delete, func, insert, literal, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.admin.application.content_management import (
    AdminContentRepository,
    AdminWriteConflict,
    ArchivedContent,
    ContentItemState,
    CreateContent,
    CreatedContent,
    CreatedDraft,
    DuplicateContentSlug,
    InvalidAdminReference,
    PracticeResource,
    PracticeResourceSet,
    PublishedVersion,
    StoredDocumentBlock,
    StoredPracticeResourceInput,
    TopicAssignment,
    VersionState,
    VersionSummary,
    WorkflowHistoryEntry,
)
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    CategoryModel,
    DomainModel,
    TopicModel,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    BlockType,
    ContentBlockModel,
    ContentItemCategoryModel,
    ContentItemModel,
    ContentItemTopicModel,
    ContentType,
    ContentVersionBlockModel,
    ContentVersionCategoryModel,
    ContentVersionModel,
    ContentVersionStatusHistoryModel,
    ContentVersionTopicModel,
    DifficultyLevel,
    PublicationStatus,
)
from recallstack.modules.learning.infrastructure.sqlalchemy_models import ActivityEventModel
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeProviderModel,
    PracticeResourceModel,
)
from recallstack.modules.sync.infrastructure.sqlalchemy_models import (
    CatalogSyncChangeLogModel,
    CatalogSyncCounterModel,
    ChangeOperation,
)
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyAdminContentRepository(AdminContentRepository):
    def __init__(self, session: AsyncSession, *, sync_retention_days: int = 30) -> None:
        self._session = session
        self._sync_retention_days = sync_retention_days

    async def active_domain_exists(self, domain_id: UUID) -> bool:
        return bool(
            await self._session.scalar(
                select(DomainModel.id).where(
                    DomainModel.id == domain_id, DomainModel.is_active.is_(True)
                )
            )
        )

    async def create_content(self, *, actor_id: UUID, command: CreateContent) -> CreatedContent:
        content_id = await self._session.scalar(
            pg_insert(ContentItemModel)
            .values(
                domain_id=command.domain_id,
                slug=command.slug,
                type=ContentType(command.content_type),
                difficulty=(DifficultyLevel(command.difficulty) if command.difficulty else None),
                created_by=actor_id,
            )
            .on_conflict_do_nothing(constraint="uq_content_items_domain_id_slug")
            .returning(ContentItemModel.id)
        )
        if content_id is None:
            raise DuplicateContentSlug
        version = ContentVersionModel(
            content_item_id=content_id,
            version_number=1,
            status=PublicationStatus.DRAFT,
            title="",
            summary=None,
            authored_by=actor_id,
            reviewed_by=None,
            published_by=None,
            published_at=None,
            row_version=1,
        )
        self._session.add(version)
        await self._session.flush()
        self._session.add(
            ContentVersionStatusHistoryModel(
                content_version_id=version.id,
                from_status=None,
                to_status=PublicationStatus.DRAFT,
                changed_by=actor_id,
                reason="Initial draft created",
            )
        )
        return CreatedContent(
            content_id,
            version.id,
            command.domain_id,
            command.slug,
            command.content_type,
            command.difficulty,
            1,
            "draft",
        )

    async def content_exists(self, content_item_id: UUID) -> bool:
        return bool(
            await self._session.scalar(
                select(ContentItemModel.id).where(ContentItemModel.id == content_item_id)
            )
        )

    async def list_versions(
        self, *, content_item_id: UUID, offset: int, limit: int
    ) -> tuple[int, tuple[VersionSummary, ...]]:
        total = int(
            await self._session.scalar(
                select(func.count(ContentVersionModel.id)).where(
                    ContentVersionModel.content_item_id == content_item_id
                )
            )
            or 0
        )
        versions = tuple(
            (
                await self._session.scalars(
                    select(ContentVersionModel)
                    .where(ContentVersionModel.content_item_id == content_item_id)
                    .order_by(ContentVersionModel.version_number.desc(), ContentVersionModel.id)
                    .offset(offset)
                    .limit(limit)
                )
            ).all()
        )
        histories = await self._histories(tuple(version.id for version in versions))
        return total, tuple(
            self._summary(version, histories.get(version.id, ())) for version in versions
        )

    async def create_next_draft(self, *, content_item_id: UUID, actor_id: UUID) -> CreatedDraft:
        item = await self._session.scalar(
            select(ContentItemModel).where(ContentItemModel.id == content_item_id).with_for_update()
        )
        if item is None:
            raise InvalidAdminReference("Content item was not found")
        if item.archived_at is not None:
            raise AdminWriteConflict("Archived content cannot receive a new draft")
        active_editorial_version = await self._session.scalar(
            select(ContentVersionModel.id).where(
                ContentVersionModel.content_item_id == content_item_id,
                ContentVersionModel.status.in_(
                    (PublicationStatus.DRAFT, PublicationStatus.IN_REVIEW)
                ),
            )
        )
        if active_editorial_version is not None:
            raise AdminWriteConflict("Content already has a draft or in-review version")
        next_number = (
            int(
                await self._session.scalar(
                    select(func.max(ContentVersionModel.version_number)).where(
                        ContentVersionModel.content_item_id == content_item_id
                    )
                )
                or 0
            )
            + 1
        )
        source: ContentVersionModel | None = None
        if item.current_published_version_id is not None:
            source = await self._session.get(ContentVersionModel, item.current_published_version_id)
        draft = ContentVersionModel(
            content_item_id=content_item_id,
            version_number=next_number,
            status=PublicationStatus.DRAFT,
            title=source.title if source else "",
            summary=source.summary if source else None,
            authored_by=actor_id,
            reviewed_by=None,
            published_by=None,
            published_at=None,
            row_version=1,
        )
        self._session.add(draft)
        await self._session.flush()
        if source is not None:
            await self._session.execute(
                insert(ContentVersionBlockModel).from_select(
                    ["content_version_id", "content_block_id", "position", "heading"],
                    select(
                        literal(draft.id),
                        ContentVersionBlockModel.content_block_id,
                        ContentVersionBlockModel.position,
                        ContentVersionBlockModel.heading,
                    ).where(ContentVersionBlockModel.content_version_id == source.id),
                )
            )
            await self._session.execute(
                insert(ContentVersionCategoryModel).from_select(
                    [
                        "content_version_id",
                        "content_item_id",
                        "domain_id",
                        "category_id",
                        "sort_order",
                    ],
                    select(
                        literal(draft.id),
                        ContentVersionCategoryModel.content_item_id,
                        ContentVersionCategoryModel.domain_id,
                        ContentVersionCategoryModel.category_id,
                        ContentVersionCategoryModel.sort_order,
                    ).where(ContentVersionCategoryModel.content_version_id == source.id),
                )
            )
            await self._session.execute(
                insert(ContentVersionTopicModel).from_select(
                    [
                        "content_version_id",
                        "content_item_id",
                        "domain_id",
                        "topic_id",
                        "is_primary",
                        "sort_order",
                    ],
                    select(
                        literal(draft.id),
                        ContentVersionTopicModel.content_item_id,
                        ContentVersionTopicModel.domain_id,
                        ContentVersionTopicModel.topic_id,
                        ContentVersionTopicModel.is_primary,
                        ContentVersionTopicModel.sort_order,
                    ).where(ContentVersionTopicModel.content_version_id == source.id),
                )
            )
        self._session.add(
            ContentVersionStatusHistoryModel(
                content_version_id=draft.id,
                from_status=None,
                to_status=PublicationStatus.DRAFT,
                changed_by=actor_id,
                reason="New draft created from current published version",
            )
        )
        return CreatedDraft(content_item_id, draft.id, next_number, "draft", 1)

    async def lock_version(self, version_id: UUID) -> VersionState | None:
        row = (
            await self._session.execute(
                select(ContentVersionModel, ContentItemModel)
                .join(
                    ContentItemModel,
                    ContentItemModel.id == ContentVersionModel.content_item_id,
                )
                .where(ContentVersionModel.id == version_id)
                .with_for_update()
            )
        ).one_or_none()
        if row is None:
            return None
        version, item = row
        block_count = int(
            await self._session.scalar(
                select(func.count())
                .select_from(ContentVersionBlockModel)
                .where(ContentVersionBlockModel.content_version_id == version_id)
            )
            or 0
        )
        category_count = int(
            await self._session.scalar(
                select(func.count())
                .select_from(ContentVersionCategoryModel)
                .where(ContentVersionCategoryModel.content_version_id == version_id)
            )
            or 0
        )
        topic_count = int(
            await self._session.scalar(
                select(func.count())
                .select_from(ContentVersionTopicModel)
                .where(ContentVersionTopicModel.content_version_id == version_id)
            )
            or 0
        )
        primary_topic_count = int(
            await self._session.scalar(
                select(func.count())
                .select_from(ContentVersionTopicModel)
                .where(
                    ContentVersionTopicModel.content_version_id == version_id,
                    ContentVersionTopicModel.is_primary.is_(True),
                )
            )
            or 0
        )
        return VersionState(
            version.id,
            item.id,
            item.domain_id,
            version.status.value,
            version.row_version,
            version.title,
            item.archived_at is not None,
            block_count,
            category_count,
            topic_count,
            primary_topic_count,
        )

    async def validate_taxonomy(
        self,
        *,
        domain_id: UUID,
        category_ids: tuple[UUID, ...],
        topic_ids: tuple[UUID, ...],
    ) -> None:
        if category_ids:
            found_categories = int(
                await self._session.scalar(
                    select(func.count(CategoryModel.id)).where(
                        CategoryModel.domain_id == domain_id,
                        CategoryModel.id.in_(category_ids),
                        CategoryModel.is_active.is_(True),
                    )
                )
                or 0
            )
            if found_categories != len(category_ids):
                raise InvalidAdminReference(
                    "Every category must be active and belong to the content domain"
                )
        if topic_ids:
            found_topics = int(
                await self._session.scalar(
                    select(func.count(TopicModel.id)).where(
                        TopicModel.domain_id == domain_id, TopicModel.id.in_(topic_ids)
                    )
                )
                or 0
            )
            if found_topics != len(topic_ids):
                raise InvalidAdminReference("Every topic must belong to the content domain")

    async def replace_document(
        self,
        *,
        version: VersionState,
        actor_id: UUID,
        title: str,
        summary: str | None,
        blocks: tuple[StoredDocumentBlock, ...],
        category_ids: tuple[UUID, ...],
        topics: tuple[TopicAssignment, ...],
    ) -> VersionSummary:
        await self._session.execute(
            delete(ContentVersionBlockModel).where(
                ContentVersionBlockModel.content_version_id == version.id
            )
        )
        for position, block in enumerate(blocks):
            block_id = await self._session.scalar(
                pg_insert(ContentBlockModel)
                .values(
                    type=BlockType(block.block_type),
                    payload=block.payload,
                    plain_text=block.plain_text,
                    content_hash=block.content_hash,
                    created_by=actor_id,
                )
                .on_conflict_do_nothing(constraint="uq_content_blocks_type_hash")
                .returning(ContentBlockModel.id)
            )
            if block_id is None:
                block_id = await self._session.scalar(
                    select(ContentBlockModel.id).where(
                        ContentBlockModel.type == BlockType(block.block_type),
                        ContentBlockModel.content_hash == block.content_hash,
                    )
                )
            if block_id is None:
                raise RuntimeError("Immutable content block could not be resolved")
            self._session.add(
                ContentVersionBlockModel(
                    content_version_id=version.id,
                    content_block_id=block_id,
                    position=position,
                    heading=block.heading,
                )
            )
        await self._session.execute(
            delete(ContentVersionCategoryModel).where(
                ContentVersionCategoryModel.content_version_id == version.id
            )
        )
        self._session.add_all(
            ContentVersionCategoryModel(
                content_version_id=version.id,
                domain_id=version.domain_id,
                content_item_id=version.content_item_id,
                category_id=category_id,
                sort_order=sort_order,
            )
            for sort_order, category_id in enumerate(category_ids)
        )
        await self._session.execute(
            delete(ContentVersionTopicModel).where(
                ContentVersionTopicModel.content_version_id == version.id
            )
        )
        self._session.add_all(
            ContentVersionTopicModel(
                content_version_id=version.id,
                domain_id=version.domain_id,
                content_item_id=version.content_item_id,
                topic_id=topic.topic_id,
                is_primary=topic.is_primary,
                sort_order=topic.sort_order,
            )
            for topic in topics
        )
        updated_id = await self._session.scalar(
            update(ContentVersionModel)
            .where(
                ContentVersionModel.id == version.id,
                ContentVersionModel.status == PublicationStatus.DRAFT,
                ContentVersionModel.row_version == version.row_version,
            )
            .values(
                title=title,
                summary=summary,
                row_version=ContentVersionModel.row_version + 1,
                updated_at=func.now(),
            )
            .returning(ContentVersionModel.id)
        )
        if updated_id is None:
            raise AdminWriteConflict("Content version changed concurrently")
        await self._session.flush()
        return await self._version_summary(version.id)

    async def transition_version(
        self,
        *,
        version: VersionState,
        actor_id: UUID,
        to_status: str,
        reason: str | None,
    ) -> VersionSummary:
        updated_id = await self._session.scalar(
            update(ContentVersionModel)
            .where(
                ContentVersionModel.id == version.id,
                ContentVersionModel.status == PublicationStatus(version.status),
                ContentVersionModel.row_version == version.row_version,
            )
            .values(
                status=PublicationStatus(to_status),
                reviewed_by=None,
                row_version=ContentVersionModel.row_version + 1,
                updated_at=func.now(),
            )
            .returning(ContentVersionModel.id)
        )
        if updated_id is None:
            raise AdminWriteConflict("Content version changed concurrently")
        self._session.add(
            ContentVersionStatusHistoryModel(
                content_version_id=version.id,
                from_status=PublicationStatus(version.status),
                to_status=PublicationStatus(to_status),
                changed_by=actor_id,
                reason=reason,
            )
        )
        await self._session.flush()
        return await self._version_summary(version.id)

    async def publish_version(
        self, *, version: VersionState, actor_id: UUID, reason: str
    ) -> PublishedVersion:
        now = datetime.now(UTC)
        updated_id = await self._session.scalar(
            update(ContentVersionModel)
            .where(
                ContentVersionModel.id == version.id,
                ContentVersionModel.status == PublicationStatus.IN_REVIEW,
                ContentVersionModel.row_version == version.row_version,
            )
            .values(
                status=PublicationStatus.PUBLISHED,
                reviewed_by=actor_id,
                published_by=actor_id,
                published_at=now,
                row_version=ContentVersionModel.row_version + 1,
                updated_at=now,
            )
            .returning(ContentVersionModel.id)
        )
        if updated_id is None:
            raise AdminWriteConflict("Content version changed concurrently")
        # Keep the legacy item-level mappings synchronized only at publication. They are
        # deprecated public-read compatibility state and are never changed by draft edits.
        await self._session.execute(
            delete(ContentItemCategoryModel).where(
                ContentItemCategoryModel.content_item_id == version.content_item_id
            )
        )
        await self._session.execute(
            insert(ContentItemCategoryModel).from_select(
                ["domain_id", "content_item_id", "category_id", "sort_order"],
                select(
                    ContentVersionCategoryModel.domain_id,
                    ContentVersionCategoryModel.content_item_id,
                    ContentVersionCategoryModel.category_id,
                    ContentVersionCategoryModel.sort_order,
                ).where(ContentVersionCategoryModel.content_version_id == version.id),
            )
        )
        await self._session.execute(
            delete(ContentItemTopicModel).where(
                ContentItemTopicModel.content_item_id == version.content_item_id
            )
        )
        await self._session.execute(
            insert(ContentItemTopicModel).from_select(
                [
                    "domain_id",
                    "content_item_id",
                    "topic_id",
                    "is_primary",
                    "sort_order",
                ],
                select(
                    ContentVersionTopicModel.domain_id,
                    ContentVersionTopicModel.content_item_id,
                    ContentVersionTopicModel.topic_id,
                    ContentVersionTopicModel.is_primary,
                    ContentVersionTopicModel.sort_order,
                ).where(ContentVersionTopicModel.content_version_id == version.id),
            )
        )
        await self._session.execute(
            update(ContentItemModel)
            .where(ContentItemModel.id == version.content_item_id)
            .values(current_published_version_id=version.id, updated_at=now)
        )
        self._session.add(
            ContentVersionStatusHistoryModel(
                content_version_id=version.id,
                from_status=PublicationStatus.IN_REVIEW,
                to_status=PublicationStatus.PUBLISHED,
                changed_by=actor_id,
                reason=reason,
                changed_at=now,
            )
        )
        await self._session.execute(
            text("SELECT refresh_content_version_search_document(:version_id)"),
            {"version_id": version.id},
        )
        version_number = await self._session.scalar(
            select(ContentVersionModel.version_number).where(ContentVersionModel.id == version.id)
        )
        if version_number is None:
            raise RuntimeError("Published version disappeared during transaction")
        await self._record_catalog_change(
            domain_id=version.domain_id,
            entity_id=version.content_item_id,
            operation=ChangeOperation.UPSERT,
            entity_version=version_number,
        )
        return PublishedVersion(
            version.content_item_id,
            version.id,
            version_number,
            "published",
            version.row_version + 1,
            now,
            actor_id,
            actor_id,
        )

    async def lock_content_item(self, content_item_id: UUID) -> ContentItemState | None:
        item = await self._session.scalar(
            select(ContentItemModel).where(ContentItemModel.id == content_item_id).with_for_update()
        )
        if item is None:
            return None
        return ContentItemState(
            item.id,
            item.domain_id,
            item.archived_at,
            item.practice_resources_revision,
        )

    async def replace_practice_resources(
        self,
        *,
        item: ContentItemState,
        actor_id: UUID,
        resources: tuple[StoredPracticeResourceInput, ...],
    ) -> PracticeResourceSet:
        provider_ids = tuple({resource.provider_id for resource in resources})
        if provider_ids:
            active_provider_count = int(
                await self._session.scalar(
                    select(func.count(PracticeProviderModel.id)).where(
                        PracticeProviderModel.id.in_(provider_ids),
                        PracticeProviderModel.is_active.is_(True),
                    )
                )
                or 0
            )
            if active_provider_count != len(provider_ids):
                raise InvalidAdminReference(
                    "Every provider_id must reference an existing active practice provider"
                )
        supplied_ids = tuple(resource.id for resource in resources if resource.id is not None)
        existing_by_id: dict[UUID, PracticeResourceModel] = {}
        if supplied_ids:
            supplied_models = tuple(
                (
                    await self._session.scalars(
                        select(PracticeResourceModel).where(
                            PracticeResourceModel.id.in_(supplied_ids)
                        )
                    )
                ).all()
            )
            existing_by_id = {resource.id: resource for resource in supplied_models}
            if len(existing_by_id) != len(supplied_ids) or any(
                resource.content_item_id != item.id for resource in supplied_models
            ):
                raise InvalidAdminReference(
                    "Every supplied practice resource ID must belong to this content item"
                )
        await self._session.execute(
            update(PracticeResourceModel)
            .where(
                PracticeResourceModel.content_item_id == item.id,
                PracticeResourceModel.archived_at.is_(None),
                PracticeResourceModel.is_primary.is_(True),
            )
            .values(is_primary=False, updated_at=func.now())
        )
        archive_filter = [
            PracticeResourceModel.content_item_id == item.id,
            PracticeResourceModel.archived_at.is_(None),
        ]
        if supplied_ids:
            archive_filter.append(PracticeResourceModel.id.not_in(supplied_ids))
        await self._session.execute(
            update(PracticeResourceModel)
            .where(*archive_filter)
            .values(archived_at=func.now(), is_primary=False, updated_at=func.now())
        )
        for resource in resources:
            values = {
                "provider_id": resource.provider_id,
                "external_key": resource.external_key,
                "url": resource.url,
                "url_hash": resource.url_hash,
                "title": resource.title,
                "is_primary": resource.is_primary,
                "sort_order": resource.sort_order,
                "archived_at": None,
                "updated_at": func.now(),
            }
            if resource.id is not None:
                model = existing_by_id[resource.id]
                for name, value in values.items():
                    setattr(model, name, value)
            else:
                duplicate = await self._session.scalar(
                    select(PracticeResourceModel.id).where(
                        PracticeResourceModel.content_item_id == item.id,
                        PracticeResourceModel.provider_id == resource.provider_id,
                        PracticeResourceModel.url_hash == resource.url_hash,
                    )
                )
                if duplicate is not None:
                    raise AdminWriteConflict(
                        "An existing resource ID is required when reusing a provider URL"
                    )
                self._session.add(PracticeResourceModel(content_item_id=item.id, **values))
        try:
            await self._session.flush()
        except IntegrityError as exc:
            raise AdminWriteConflict(
                "Practice resource replacement conflicts with existing data"
            ) from exc
        revision = await self._session.scalar(
            update(ContentItemModel)
            .where(
                ContentItemModel.id == item.id,
                ContentItemModel.practice_resources_revision == item.practice_resources_revision,
            )
            .values(
                practice_resources_revision=ContentItemModel.practice_resources_revision + 1,
                updated_at=func.now(),
            )
            .returning(ContentItemModel.practice_resources_revision)
        )
        if revision is None:
            raise AdminWriteConflict("Practice resource revision changed concurrently")
        self._session.add(
            ActivityEventModel(
                user_id=actor_id,
                content_item_id=item.id,
                event_type="admin_practice_resources_replaced",
                source_entity_type="content_item",
                source_entity_id=item.id,
                metadata_={
                    "revision": revision,
                    "active_resource_count": len(resources),
                },
            )
        )
        active = tuple(
            (
                await self._session.scalars(
                    select(PracticeResourceModel)
                    .where(
                        PracticeResourceModel.content_item_id == item.id,
                        PracticeResourceModel.archived_at.is_(None),
                    )
                    .order_by(
                        PracticeResourceModel.sort_order,
                        PracticeResourceModel.id,
                    )
                )
            ).all()
        )
        return PracticeResourceSet(
            item.id,
            revision,
            tuple(
                PracticeResource(
                    resource.id,
                    resource.provider_id,
                    resource.external_key,
                    resource.url,
                    resource.title,
                    resource.is_primary,
                    resource.sort_order,
                )
                for resource in active
            ),
        )

    async def archive_content(
        self, *, item: ContentItemState, actor_id: UUID, reason: str
    ) -> ArchivedContent:
        if item.archived_at is not None:
            return ArchivedContent(item.id, item.archived_at)
        now = datetime.now(UTC)
        await self._session.execute(
            update(ContentItemModel)
            .where(ContentItemModel.id == item.id)
            .values(archived_at=now, updated_at=now)
        )
        await self._record_catalog_change(
            domain_id=item.domain_id,
            entity_id=item.id,
            operation=ChangeOperation.DELETE,
            entity_version=None,
        )
        self._session.add(
            ActivityEventModel(
                user_id=actor_id,
                content_item_id=item.id,
                event_type="admin_content_archived",
                source_entity_type="content_item",
                source_entity_id=item.id,
                metadata_={"reason": reason},
                occurred_at=now,
            )
        )
        return ArchivedContent(item.id, now)

    async def _record_catalog_change(
        self,
        *,
        domain_id: UUID,
        entity_id: UUID,
        operation: ChangeOperation,
        entity_version: int | None,
    ) -> None:
        await self._session.execute(
            pg_insert(CatalogSyncCounterModel)
            .values(domain_id=domain_id, last_cursor=0)
            .on_conflict_do_nothing(index_elements=[CatalogSyncCounterModel.domain_id])
        )
        counter = await self._session.scalar(
            select(CatalogSyncCounterModel)
            .where(CatalogSyncCounterModel.domain_id == domain_id)
            .with_for_update()
        )
        if counter is None:
            raise RuntimeError("Catalog sync counter could not be created")
        counter.last_cursor += 1
        now = datetime.now(UTC)
        counter.updated_at = now
        self._session.add(
            CatalogSyncChangeLogModel(
                domain_id=domain_id,
                cursor=counter.last_cursor,
                entity_type="content_item",
                entity_id=entity_id,
                operation=operation,
                entity_version=entity_version,
                retain_until=now + timedelta(days=self._sync_retention_days),
            )
        )

    async def _version_summary(self, version_id: UUID) -> VersionSummary:
        version = await self._session.get(ContentVersionModel, version_id)
        if version is None:
            raise RuntimeError("Content version disappeared during transaction")
        histories = await self._histories((version_id,))
        return self._summary(version, histories.get(version_id, ()))

    async def _histories(
        self, version_ids: tuple[UUID, ...]
    ) -> dict[UUID, tuple[WorkflowHistoryEntry, ...]]:
        if not version_ids:
            return {}
        rows = (
            await self._session.scalars(
                select(ContentVersionStatusHistoryModel)
                .where(ContentVersionStatusHistoryModel.content_version_id.in_(version_ids))
                .order_by(
                    ContentVersionStatusHistoryModel.changed_at,
                    ContentVersionStatusHistoryModel.id,
                )
            )
        ).all()
        grouped: dict[UUID, list[WorkflowHistoryEntry]] = {}
        for row in rows:
            grouped.setdefault(row.content_version_id, []).append(
                WorkflowHistoryEntry(
                    row.from_status.value if row.from_status else None,
                    row.to_status.value,
                    row.changed_by,
                    row.reason,
                    row.changed_at,
                )
            )
        return {key: tuple(value) for key, value in grouped.items()}

    @staticmethod
    def _summary(
        version: ContentVersionModel,
        history: tuple[WorkflowHistoryEntry, ...],
    ) -> VersionSummary:
        return VersionSummary(
            version.id,
            version.content_item_id,
            version.version_number,
            version.status.value,
            version.title,
            version.summary,
            version.authored_by,
            version.reviewed_by,
            version.published_by,
            version.published_at,
            version.row_version,
            version.created_at,
            version.updated_at,
            history,
        )


class SqlAlchemyAdminContentUnitOfWork:
    def __init__(
        self,
        session_factory: DatabaseSessionFactory[AsyncSession],
        *,
        sync_retention_days: int = 30,
    ) -> None:
        self._session_factory = session_factory
        self._sync_retention_days = sync_retention_days
        self._session: AsyncSession | None = None
        self.repository: AdminContentRepository

    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        self.repository = SqlAlchemyAdminContentRepository(
            self._session, sync_retention_days=self._sync_retention_days
        )
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._session is None:
            return
        if exc_type is not None:
            await self._session.rollback()
        await self._session.close()

    async def commit(self) -> None:
        if self._session is None:
            raise RuntimeError("Unit of work has not been entered")
        try:
            await self._session.commit()
        except IntegrityError as exc:
            await self._session.rollback()
            raise AdminWriteConflict("The content write conflicts with existing data") from exc
