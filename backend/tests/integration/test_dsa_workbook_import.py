from dataclasses import replace
from pathlib import Path
from typing import cast

import pytest
from sqlalchemy import func, select

from recallstack.commands.seed import seed
from recallstack.composition.dsa_import import (
    SqlAlchemyDsaImportStateReader,
    SqlAlchemyDsaProblemWriter,
)
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


class _FailingAdminContentProxy:
    def __init__(self, wrapped: AdminContentService, stage: str) -> None:
        self._wrapped = wrapped
        self._stage = stage

    def __getattr__(self, name: str) -> object:
        return getattr(self._wrapped, name)

    async def replace_practice_resources(self, **kwargs: object):  # type: ignore[no-untyped-def]
        if self._stage == "after_document":
            raise RuntimeError("failure after document update")
        result = await self._wrapped.replace_practice_resources(**kwargs)  # type: ignore[arg-type]
        if self._stage == "after_resources":
            raise RuntimeError("failure after practice resources")
        return result

    async def publish(self, **kwargs: object):  # type: ignore[no-untyped-def]
        if self._stage == "before_publish":
            raise RuntimeError("failure before publish")
        return await self._wrapped.publish(**kwargs)  # type: ignore[arg-type]


class FailingDsaProblemWriter(SqlAlchemyDsaProblemWriter):
    def __init__(self, *args: object, stage: str, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)  # type: ignore[arg-type]
        self._stage = stage

    def _content_service(self, session):  # type: ignore[no-untyped-def]
        return cast(
            AdminContentService,
            _FailingAdminContentProxy(super()._content_service(session), self._stage),
        )


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
        problem_writer=SqlAlchemyDsaProblemWriter(database.session_factory),
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


@pytest.mark.integration
async def test_dsa_import_row_is_atomic_across_failure_checkpoints(
    migrated_database_url: str,
) -> None:
    await seed()
    database = Database(
        Settings(
            app_env="test",
            database_url=migrated_database_url,
            supabase_project_url="https://example.supabase.co",
        )
    )
    base = DsaProblem(
        source_index=9002,
        source_row=21,
        category="Arrays",
        title="Atomic Import v1",
        companies=None,
        remarks=None,
        difficulty="medium",
        url="https://leetcode.com/problems/three-sum/",
        provider_slug="leetcode",
        slug=normalize_slug(9002, "Atomic Import"),
        fingerprint="1" * 64,
    )

    def importer(problem: DsaProblem, writer: SqlAlchemyDsaProblemWriter) -> DsaWorkbookImporter:
        return DsaWorkbookImporter(
            workbook_reader=OneProblemWorkbookReader(problem),
            state_reader=SqlAlchemyDsaImportStateReader(database.session_factory),
            problem_writer=writer,
        )

    async def published_state() -> tuple[object, ...]:
        async with database.session_factory.create_session() as session:
            row = (
                await session.execute(
                    select(
                        ContentItemModel.current_published_version_id,
                        ContentVersionModel.title,
                        ContentBlockModel.payload,
                        PracticeResourceModel.url,
                    )
                    .join(
                        ContentVersionModel,
                        ContentVersionModel.id == ContentItemModel.current_published_version_id,
                    )
                    .join(
                        ContentVersionBlockModel,
                        ContentVersionBlockModel.content_version_id == ContentVersionModel.id,
                    )
                    .join(
                        ContentBlockModel,
                        ContentBlockModel.id == ContentVersionBlockModel.content_block_id,
                    )
                    .join(
                        PracticeResourceModel,
                        PracticeResourceModel.content_item_id == ContentItemModel.id,
                    )
                    .where(
                        ContentItemModel.slug == base.slug,
                        PracticeResourceModel.archived_at.is_(None),
                    )
                )
            ).one()
        return tuple(row)

    try:
        initial = await importer(base, SqlAlchemyDsaProblemWriter(database.session_factory)).run(
            source_path=Path("fixture.xlsx"), apply=True, actor_id=TEST_PUBLISHER_PROFILE_ID
        )
        assert (initial.applied, initial.failed) == (1, 0)
        original = await published_state()

        changed = replace(base, title="Atomic Import v2", fingerprint="2" * 64)
        for stage in ("after_document", "after_resources", "before_publish"):
            report = await importer(
                changed,
                FailingDsaProblemWriter(database.session_factory, stage=stage),
            ).run(
                source_path=Path("fixture.xlsx"),
                apply=True,
                actor_id=TEST_PUBLISHER_PROFILE_ID,
            )
            assert (report.applied, report.failed) == (0, 1)
            assert await published_state() == original

        recovered = await importer(
            changed, SqlAlchemyDsaProblemWriter(database.session_factory)
        ).run(source_path=Path("fixture.xlsx"), apply=True, actor_id=TEST_PUBLISHER_PROFILE_ID)
        assert (recovered.applied, recovered.failed) == (1, 0)
        assert (await published_state())[1] == "Atomic Import v2"
    finally:
        await database.close()
