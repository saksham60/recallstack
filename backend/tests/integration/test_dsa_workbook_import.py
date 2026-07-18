from pathlib import Path

import pytest
from sqlalchemy import func, select

from recallstack.commands.seed import seed
from recallstack.composition.admin_content_uow import SqlAlchemyAdminContentUnitOfWork
from recallstack.composition.dsa_import import SqlAlchemyDsaImportStateReader
from recallstack.modules.admin.application.content_management import AdminContentService
from recallstack.modules.admin.application.dsa_import import (
    DsaProblem,
    DsaWorkbook,
    DsaWorkbookImporter,
    fingerprint_for,
    normalize_slug,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentBlockModel,
    ContentItemModel,
    ContentVersionBlockModel,
    ContentVersionModel,
    PublicationStatus,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeProviderModel,
    PracticeResourceModel,
)
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from tests.conftest import TEST_PUBLISHER_PROFILE_ID


class OneProblemWorkbookReader:
    def __init__(self, problem: DsaProblem) -> None:
        self._problem = problem

    def read(self, path: Path) -> DsaWorkbook:
        del path
        return DsaWorkbook((self._problem,))


@pytest.mark.integration
async def test_dsa_import_publishes_and_is_idempotent(migrated_database_url: str) -> None:
    await seed()
    database = Database(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            supabase_project_url="https://example.supabase.co",
        )
    )
    raw: dict[str, object] = {
        "source_index": 9001,
        "category": "Arrays",
        "title": "Integration Import Problem",
        "companies": "RecallStack",
        "remarks": None,
        "difficulty": "medium",
        "url": "https://leetcode.com/problems/two-sum/",
    }
    problem = DsaProblem(
        source_index=9001,
        source_row=20,
        category="Arrays",
        title="Integration Import Problem",
        companies="RecallStack",
        remarks=None,
        difficulty="medium",
        url="https://leetcode.com/problems/two-sum/",
        provider_slug="leetcode",
        slug=normalize_slug(9001, "Integration Import Problem"),
        fingerprint=fingerprint_for(raw),
    )
    importer = DsaWorkbookImporter(
        workbook_reader=OneProblemWorkbookReader(problem),
        state_reader=SqlAlchemyDsaImportStateReader(database.session_factory),
        content_service=AdminContentService(
            lambda: SqlAlchemyAdminContentUnitOfWork(database.session_factory), None
        ),
    )
    try:
        first = await importer.run(
            source_path=Path("fixture.xlsx"),
            apply=True,
            actor_id=TEST_PUBLISHER_PROFILE_ID,
        )
        second = await importer.run(
            source_path=Path("fixture.xlsx"),
            apply=True,
            actor_id=TEST_PUBLISHER_PROFILE_ID,
        )

        assert (first.applied, first.failed) == (1, 0)
        assert (second.applied, second.unchanged, second.failed) == (0, 1, 0)
        async with database.session_factory.create_session() as session:
            item = await session.scalar(
                select(ContentItemModel).where(ContentItemModel.slug == problem.slug)
            )
            assert item is not None
            assert item.current_published_version_id is not None
            version = await session.get(ContentVersionModel, item.current_published_version_id)
            assert version is not None
            assert version.status == PublicationStatus.PUBLISHED
            assert version.published_by == TEST_PUBLISHER_PROFILE_ID
            payload = await session.scalar(
                select(ContentBlockModel.payload)
                .join(
                    ContentVersionBlockModel,
                    ContentVersionBlockModel.content_block_id == ContentBlockModel.id,
                )
                .where(ContentVersionBlockModel.content_version_id == version.id)
            )
            assert payload is not None
            assert payload["import_fingerprint"] == problem.fingerprint
            resource_count = await session.scalar(
                select(func.count(PracticeResourceModel.id)).where(
                    PracticeResourceModel.content_item_id == item.id,
                    PracticeResourceModel.archived_at.is_(None),
                )
            )
            seeded_providers = set(
                await session.scalars(
                    select(PracticeProviderModel.slug).where(
                        PracticeProviderModel.slug.in_(
                            {
                                "leetcode",
                                "geeksforgeeks",
                                "interviewbit",
                                "spoj",
                                "hackerrank",
                                "hackerearth",
                                "cp-algorithms",
                            }
                        ),
                        PracticeProviderModel.is_active.is_(True),
                    )
                )
            )
            assert resource_count == 1
            assert len(seeded_providers) == 7
    finally:
        await database.close()
