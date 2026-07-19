import asyncio
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text

from recallstack.composition.admin_content_uow import SqlAlchemyAdminContentUnitOfWork
from recallstack.composition.category_dashboard_uow import SqlAlchemyCategoryDashboardUnitOfWork
from recallstack.composition.published_study_note_uow import SqlAlchemyPublishedStudyNoteUnitOfWork
from recallstack.composition.search_uow import SqlAlchemySearchUnitOfWork
from recallstack.modules.admin.application.content_management import (
    AdminContentService,
    CreateContent,
    DocumentBlock,
    PracticeResourceInput,
    TopicAssignment,
    UpdateDocument,
)
from recallstack.modules.catalog.application.category_dashboard import CategoryDashboardService
from recallstack.modules.catalog.application.search import SearchFilters, SearchService
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    CategoryModel,
    DomainModel,
    TopicKind,
    TopicModel,
)
from recallstack.modules.content.application.published_study_note import PublishedStudyNoteService
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel,
    ContentVersionModel,
    ContentVersionStatusHistoryModel,
)
from recallstack.modules.learning.infrastructure.activity_event_recorder import (
    SqlAlchemyActivityEventRecorder,
)
from recallstack.modules.learning.infrastructure.sqlalchemy_models import ActivityEventModel
from recallstack.modules.practice.infrastructure.sqlalchemy_models import PracticeProviderModel
from recallstack.modules.sync.infrastructure.sqlalchemy_models import CatalogSyncChangeLogModel
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.errors import AppError
from tests.conftest import TEST_PUBLISHER_PROFILE_ID


async def _seed_catalog(database: Database) -> tuple[UUID, UUID, UUID, UUID, int, int]:
    domain_id = uuid4()
    other_domain_id = uuid4()
    category_id = uuid4()
    other_category_id = uuid4()
    topic_id = uuid4()
    async with database.session_factory.create_session() as session, session.begin():
        session.add_all(
            [
                DomainModel(id=domain_id, slug=f"d-{domain_id}", name="Domain", is_active=True),
                DomainModel(
                    id=other_domain_id,
                    slug=f"d-{other_domain_id}",
                    name="Other",
                    is_active=True,
                ),
            ]
        )
        await session.flush()
        session.add_all(
            [
                CategoryModel(
                    id=category_id,
                    domain_id=domain_id,
                    slug="arrays",
                    name="Arrays",
                    is_active=True,
                ),
                CategoryModel(
                    id=other_category_id,
                    domain_id=other_domain_id,
                    slug="other",
                    name="Other",
                    is_active=True,
                ),
                TopicModel(
                    id=topic_id,
                    domain_id=domain_id,
                    kind=TopicKind.TOPIC,
                    slug="kadane",
                    name="Kadane",
                ),
            ]
        )
        active = PracticeProviderModel(
            slug=f"provider-{domain_id}", name="Active Provider", is_active=True
        )
        inactive = PracticeProviderModel(
            slug=f"inactive-{domain_id}", name="Inactive Provider", is_active=False
        )
        session.add_all([active, inactive])
        await session.flush()
        return (
            domain_id,
            category_id,
            other_category_id,
            topic_id,
            active.id,
            inactive.id,
        )


def _document(
    *, expected_row_version: int, category_id: UUID, topic_id: UUID, title: str = "Maximum Subarray"
) -> UpdateDocument:
    return UpdateDocument(
        expected_row_version=expected_row_version,
        title=title,
        summary="Find the contiguous subarray with the largest sum.",
        blocks=(
            DocumentBlock(
                "recognize",
                "Recognition Signal",
                {"text": "Look for the maximum sum over a contiguous range."},
            ),
        ),
        category_ids=(category_id,),
        topics=(TopicAssignment(topic_id, True, 0),),
    )


@pytest.mark.integration
async def test_admin_content_workflow_is_atomic_audited_and_concurrency_safe(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    actor_id = TEST_PUBLISHER_PROFILE_ID
    service = AdminContentService(
        lambda: SqlAlchemyAdminContentUnitOfWork(database.session_factory), None
    )
    try:
        (
            domain_id,
            category_id,
            other_category_id,
            topic_id,
            provider_id,
            inactive_id,
        ) = await _seed_catalog(database)
        created = await service.create_content(
            actor_id=actor_id,
            command=CreateContent(domain_id, "maximum-subarray", "problem", "medium"),
        )
        assert created.version_number == 1
        assert created.version_status == "draft"

        with pytest.raises(AppError) as duplicate:
            await service.create_content(
                actor_id=actor_id,
                command=CreateContent(domain_id, "maximum-subarray", "problem", "medium"),
            )
        assert duplicate.value.status == 409

        with pytest.raises(AppError) as wrong_domain:
            await service.update_document(
                version_id=created.draft_version_id,
                actor_id=actor_id,
                command=_document(
                    expected_row_version=1,
                    category_id=other_category_id,
                    topic_id=topic_id,
                ),
            )
        assert wrong_domain.value.status == 422

        edited = await service.update_document(
            version_id=created.draft_version_id,
            actor_id=actor_id,
            command=_document(expected_row_version=1, category_id=category_id, topic_id=topic_id),
        )
        assert edited.row_version == 2

        resource_set = await service.replace_practice_resources(
            content_item_id=created.content_item_id,
            actor_id=actor_id,
            expected_revision=1,
            resources=(
                PracticeResourceInput(
                    None,
                    provider_id,
                    "53",
                    "https://leetcode.com/problems/maximum-subarray/",
                    "Maximum Subarray",
                    True,
                    0,
                ),
            ),
        )
        assert resource_set.revision == 2
        assert resource_set.resources[0].provider_id == provider_id

        with pytest.raises(AppError) as stale_resources:
            await service.replace_practice_resources(
                content_item_id=created.content_item_id,
                actor_id=actor_id,
                expected_revision=1,
                resources=(),
            )
        assert stale_resources.value.status == 409

        with pytest.raises(AppError) as inactive_provider:
            await service.replace_practice_resources(
                content_item_id=created.content_item_id,
                actor_id=actor_id,
                expected_revision=2,
                resources=(
                    PracticeResourceInput(
                        None,
                        inactive_id,
                        None,
                        "https://example.com/problem/",
                        None,
                        False,
                        0,
                    ),
                ),
            )
        assert inactive_provider.value.status == 422

        updated_resources = await service.replace_practice_resources(
            content_item_id=created.content_item_id,
            actor_id=actor_id,
            expected_revision=2,
            resources=(
                PracticeResourceInput(
                    resource_set.resources[0].id,
                    provider_id,
                    "53",
                    "https://leetcode.com/problems/maximum-subarray/",
                    "Maximum Subarray (updated)",
                    True,
                    0,
                ),
            ),
        )
        assert updated_resources.revision == 3
        assert updated_resources.resources[0].title == "Maximum Subarray (updated)"

        archived_resources = await service.replace_practice_resources(
            content_item_id=created.content_item_id,
            actor_id=actor_id,
            expected_revision=3,
            resources=(),
        )
        assert archived_resources.revision == 4
        assert archived_resources.resources == ()

        in_review = await service.submit_review(
            version_id=created.draft_version_id,
            actor_id=actor_id,
            expected_row_version=2,
            reason="Ready for review",
        )
        assert in_review.status == "in_review"
        assert in_review.row_version == 3

        published = await service.publish(
            version_id=created.draft_version_id,
            actor_id=actor_id,
            expected_row_version=3,
            reason="Reviewed and approved",
        )
        assert published.status == "published"
        assert published.published_by == actor_id
        assert published.reviewed_by == actor_id

        async with database.session_factory.create_session() as session:
            item = await session.get(ContentItemModel, created.content_item_id)
            version = await session.get(ContentVersionModel, created.draft_version_id)
            history = tuple(
                (
                    await session.scalars(
                        select(ContentVersionStatusHistoryModel).where(
                            ContentVersionStatusHistoryModel.content_version_id
                            == created.draft_version_id
                        )
                    )
                ).all()
            )
            search_document = await session.scalar(
                text("SELECT search_document FROM content_versions WHERE id = :id"),
                {"id": created.draft_version_id},
            )
            catalog_change = await session.scalar(
                select(CatalogSyncChangeLogModel).where(
                    CatalogSyncChangeLogModel.domain_id == domain_id,
                    CatalogSyncChangeLogModel.entity_id == created.content_item_id,
                )
            )
        assert item is not None
        assert version is not None
        assert item.current_published_version_id == created.draft_version_id
        assert version.published_by == actor_id
        assert [entry.to_status.value for entry in history] == [
            "draft",
            "in_review",
            "published",
        ]
        assert search_document is not None
        assert catalog_change is not None
        assert catalog_change.operation.value == "upsert"

        with pytest.raises(AppError) as immutable:
            await service.update_document(
                version_id=created.draft_version_id,
                actor_id=actor_id,
                command=_document(
                    expected_row_version=published.row_version,
                    category_id=category_id,
                    topic_id=topic_id,
                ),
            )
        assert immutable.value.status == 409
        assert "immutable" in immutable.value.detail

        second_draft = await service.create_draft(
            content_item_id=created.content_item_id, actor_id=actor_id
        )
        results = await asyncio.gather(
            service.update_document(
                version_id=second_draft.draft_version_id,
                actor_id=actor_id,
                command=_document(
                    expected_row_version=1,
                    category_id=category_id,
                    topic_id=topic_id,
                    title="Maximum Subarray v2",
                ),
            ),
            service.update_document(
                version_id=second_draft.draft_version_id,
                actor_id=actor_id,
                command=_document(
                    expected_row_version=1,
                    category_id=category_id,
                    topic_id=topic_id,
                    title="Conflicting edit",
                ),
            ),
            return_exceptions=True,
        )
        assert sum(not isinstance(result, Exception) for result in results) == 1
        conflicts = [result for result in results if isinstance(result, AppError)]
        assert len(conflicts) == 1
        assert conflicts[0].status == 409

        review = await service.submit_review(
            version_id=second_draft.draft_version_id,
            actor_id=actor_id,
            expected_row_version=2,
            reason="Review v2",
        )
        returned = await service.return_to_draft(
            version_id=second_draft.draft_version_id,
            actor_id=actor_id,
            expected_row_version=review.row_version,
            reason="Needs a clearer explanation",
        )
        assert returned.status == "draft"
        assert returned.history[-1].reason == "Needs a clearer explanation"

        archived = await service.archive(
            content_item_id=created.content_item_id,
            actor_id=actor_id,
            reason="Retired from catalog",
        )
        assert archived.content_item_id == created.content_item_id
        async with database.session_factory.create_session() as session:
            audit_events = tuple(
                (
                    await session.scalars(
                        select(ActivityEventModel)
                        .where(ActivityEventModel.content_item_id == created.content_item_id)
                        .order_by(ActivityEventModel.id)
                    )
                ).all()
            )
        resource_audits = [
            event
            for event in audit_events
            if event.event_type == "admin_practice_resources_replaced"
        ]
        resource_revisions: list[object] = []
        for event in resource_audits:
            assert event.metadata_ is not None
            resource_revisions.append(event.metadata_["revision"])
        assert resource_revisions == [2, 3, 4]
        archive_audit = next(
            event for event in audit_events if event.event_type == "admin_content_archived"
        )
        assert archive_audit.user_id == actor_id
        assert archive_audit.metadata_ is not None
        assert archive_audit.metadata_["reason"] == "Retired from catalog"
    finally:
        await database.close()


@pytest.mark.integration
async def test_draft_taxonomy_is_invisible_until_atomic_publication(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    actor_id = TEST_PUBLISHER_PROFILE_ID
    domain_id, category_a, category_b, topic_a, topic_b = (uuid4() for _ in range(5))
    domain_slug = f"taxonomy-{domain_id.hex[:10]}"
    async with database.session_factory.create_session() as session, session.begin():
        session.add(DomainModel(id=domain_id, slug=domain_slug, name="Taxonomy", is_active=True))
        await session.flush()
        session.add_all(
            [
                CategoryModel(
                    id=category_a,
                    domain_id=domain_id,
                    slug="category-a",
                    name="Category A",
                    is_active=True,
                ),
                CategoryModel(
                    id=category_b,
                    domain_id=domain_id,
                    slug="category-b",
                    name="Category B",
                    is_active=True,
                ),
                TopicModel(
                    id=topic_a,
                    domain_id=domain_id,
                    kind=TopicKind.TOPIC,
                    slug="topic-a",
                    name="Topic A",
                ),
                TopicModel(
                    id=topic_b,
                    domain_id=domain_id,
                    kind=TopicKind.TOPIC,
                    slug="topic-b",
                    name="Topic B",
                ),
            ]
        )

    admin = AdminContentService(
        lambda: SqlAlchemyAdminContentUnitOfWork(database.session_factory), None
    )
    dashboard = CategoryDashboardService(
        lambda: SqlAlchemyCategoryDashboardUnitOfWork(database.session_factory)
    )
    reader = PublishedStudyNoteService(
        lambda: SqlAlchemyPublishedStudyNoteUnitOfWork(database.session_factory),
        SqlAlchemyActivityEventRecorder(database.session_factory),
    )
    search = SearchService(lambda: SqlAlchemySearchUnitOfWork(database.session_factory))

    def document(version: int, category: UUID, topic: UUID, title: str) -> UpdateDocument:
        return UpdateDocument(
            expected_row_version=version,
            title=title,
            summary=f"{title} summary",
            blocks=(DocumentBlock("recognize", None, {"text": title}),),
            category_ids=(category,),
            topics=(TopicAssignment(topic, True, 0),),
        )

    try:
        created = await admin.create_content(
            actor_id=actor_id,
            command=CreateContent(domain_id, "taxonomy-isolation", "problem", "medium"),
        )
        await admin.update_document(
            version_id=created.draft_version_id,
            actor_id=actor_id,
            command=document(1, category_a, topic_a, "Published v1"),
        )
        await admin.submit_review(
            version_id=created.draft_version_id,
            actor_id=actor_id,
            expected_row_version=2,
            reason="v1 review",
        )
        await admin.publish(
            version_id=created.draft_version_id,
            actor_id=actor_id,
            expected_row_version=3,
            reason="v1 publish",
        )
        draft = await admin.create_draft(content_item_id=created.content_item_id, actor_id=actor_id)
        await admin.update_document(
            version_id=draft.draft_version_id,
            actor_id=actor_id,
            command=document(1, category_b, topic_b, "Draft v2"),
        )

        before_dashboard = await dashboard.query(domain_slug=domain_slug, profile_id=actor_id)
        before_counts = {item.slug: item.total_content_items for item in before_dashboard}
        assert before_counts == {"category-a": 1, "category-b": 0}
        before_note = await reader.query(slug="taxonomy-isolation", profile_id=actor_id)
        assert before_note.title == "Published v1"
        assert [category.id for category in before_note.categories] == [category_a]
        assert [topic.id for topic in before_note.topics] == [topic_a]
        search_a = await search.query(
            profile_id=actor_id,
            filters=SearchFilters("", domain_slug, "category-a", "topic-a", None, None, 1, 25),
        )
        search_b = await search.query(
            profile_id=actor_id,
            filters=SearchFilters("", domain_slug, "category-b", "topic-b", None, None, 1, 25),
        )
        assert [item.content_item_id for item in search_a.items] == [created.content_item_id]
        assert search_b.items == ()

        await admin.submit_review(
            version_id=draft.draft_version_id,
            actor_id=actor_id,
            expected_row_version=2,
            reason="v2 review",
        )
        await admin.publish(
            version_id=draft.draft_version_id,
            actor_id=actor_id,
            expected_row_version=3,
            reason="v2 publish",
        )

        after_dashboard = await dashboard.query(domain_slug=domain_slug, profile_id=actor_id)
        after_counts = {item.slug: item.total_content_items for item in after_dashboard}
        assert after_counts == {"category-a": 0, "category-b": 1}
        after_note = await reader.query(slug="taxonomy-isolation", profile_id=actor_id)
        assert after_note.title == "Draft v2"
        assert [category.id for category in after_note.categories] == [category_b]
        assert [topic.id for topic in after_note.topics] == [topic_b]
        assert (
            await search.query(
                profile_id=actor_id,
                filters=SearchFilters("", domain_slug, "category-a", "topic-a", None, None, 1, 25),
            )
        ).items == ()
        assert [
            item.content_item_id
            for item in (
                await search.query(
                    profile_id=actor_id,
                    filters=SearchFilters(
                        "", domain_slug, "category-b", "topic-b", None, None, 1, 25
                    ),
                )
            ).items
        ] == [created.content_item_id]
    finally:
        await database.close()
