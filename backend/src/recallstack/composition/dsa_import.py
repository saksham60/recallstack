from types import TracebackType
from typing import Self
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.composition.admin_content_uow import SqlAlchemyAdminContentRepository
from recallstack.modules.admin.application.content_management import (
    AdminContentRepository,
    AdminContentService,
)
from recallstack.modules.admin.application.dsa_import import (
    DsaImportStateReader,
    DsaProblem,
    DsaProblemWriter,
    DsaWorkbookImporter,
    ImportContentState,
    ImportReferences,
)
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    CategoryModel,
    DomainModel,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentBlockModel,
    ContentItemModel,
    ContentVersionBlockModel,
    ContentVersionModel,
    PublicationStatus,
)
from recallstack.modules.identity.infrastructure.sqlalchemy_models import (
    ProfileModel,
    ProfileRoleGrantModel,
    RoleModel,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeProviderModel,
    PracticeResourceModel,
)
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyDsaImportStateReader(DsaImportStateReader):
    def __init__(self, session_factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def validate_admin_actor(self, actor_id: UUID) -> bool:
        async with self._session_factory.create_session() as session:
            result = await session.scalar(
                select(ProfileModel.id)
                .join(ProfileRoleGrantModel, ProfileRoleGrantModel.profile_id == ProfileModel.id)
                .join(RoleModel, RoleModel.id == ProfileRoleGrantModel.role_id)
                .where(
                    ProfileModel.id == actor_id,
                    RoleModel.code == "admin",
                    ProfileRoleGrantModel.revoked_at.is_(None),
                )
            )
        return result is not None

    async def references(self) -> ImportReferences:
        async with self._session_factory.create_session() as session:
            domain = await session.scalar(
                select(DomainModel).where(
                    DomainModel.slug == "dsa", DomainModel.is_active.is_(True)
                )
            )
            if domain is None:
                raise ValueError("The active DSA domain is not seeded")
            categories = await session.scalars(
                select(CategoryModel).where(
                    CategoryModel.domain_id == domain.id, CategoryModel.is_active.is_(True)
                )
            )
            providers = await session.scalars(
                select(PracticeProviderModel).where(PracticeProviderModel.is_active.is_(True))
            )
            return ImportReferences(
                domain_id=domain.id,
                category_ids={category.slug: category.id for category in categories},
                provider_ids={provider.slug: provider.id for provider in providers},
            )

    async def content_state(self, *, domain_id: UUID, slug: str) -> ImportContentState | None:
        async with self._session_factory.create_session() as session:
            item = await session.scalar(
                select(ContentItemModel).where(
                    ContentItemModel.domain_id == domain_id, ContentItemModel.slug == slug
                )
            )
            if item is None:
                return None
            fingerprint = await self._published_fingerprint(
                session, item.current_published_version_id
            )
            editable = await session.scalar(
                select(ContentVersionModel)
                .where(
                    ContentVersionModel.content_item_id == item.id,
                    ContentVersionModel.status.in_(
                        (PublicationStatus.DRAFT, PublicationStatus.IN_REVIEW)
                    ),
                )
                .order_by(desc(ContentVersionModel.version_number))
                .limit(1)
            )
            primary_resource_id = await session.scalar(
                select(PracticeResourceModel.id).where(
                    PracticeResourceModel.content_item_id == item.id,
                    PracticeResourceModel.archived_at.is_(None),
                    PracticeResourceModel.is_primary.is_(True),
                )
            )
            return ImportContentState(
                content_item_id=item.id,
                published_fingerprint=fingerprint,
                editable_version_id=editable.id if editable else None,
                editable_status=editable.status.value if editable else None,
                editable_row_version=editable.row_version if editable else None,
                practice_resources_revision=item.practice_resources_revision,
                primary_practice_resource_id=primary_resource_id,
            )

    @staticmethod
    async def _published_fingerprint(session: AsyncSession, version_id: UUID | None) -> str | None:
        if version_id is None:
            return None
        payload = await session.scalar(
            select(ContentBlockModel.payload)
            .join(
                ContentVersionBlockModel,
                ContentVersionBlockModel.content_block_id == ContentBlockModel.id,
            )
            .where(ContentVersionBlockModel.content_version_id == version_id)
            .order_by(ContentVersionBlockModel.position)
            .limit(1)
        )
        if not isinstance(payload, dict):
            return None
        fingerprint = payload.get("import_fingerprint")
        return fingerprint if isinstance(fingerprint, str) else None


class _AmbientAdminContentUnitOfWork:
    def __init__(self, session: AsyncSession, *, sync_retention_days: int) -> None:
        self._session = session
        self.repository: AdminContentRepository = SqlAlchemyAdminContentRepository(
            session, sync_retention_days=sync_retention_days
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return None

    async def commit(self) -> None:
        # The importer owns the outer transaction. Flush here preserves the normal service
        # validation points without making partially imported state externally visible.
        await self._session.flush()


class SqlAlchemyDsaProblemWriter(DsaProblemWriter):
    """Applies one workbook row as one PostgreSQL transaction."""

    def __init__(
        self,
        session_factory: DatabaseSessionFactory[AsyncSession],
        *,
        sync_retention_days: int = 30,
    ) -> None:
        self._session_factory = session_factory
        self._sync_retention_days = sync_retention_days

    def _content_service(self, session: AsyncSession) -> AdminContentService:
        return AdminContentService(
            lambda: _AmbientAdminContentUnitOfWork(
                session, sync_retention_days=self._sync_retention_days
            ),
            None,
        )

    async def apply_problem(
        self,
        *,
        problem: DsaProblem,
        references: ImportReferences,
        state: ImportContentState | None,
        actor_id: UUID,
    ) -> None:
        async with self._session_factory.create_session() as session, session.begin():
            await DsaWorkbookImporter.apply_problem_with_service(
                content_service=self._content_service(session),
                problem=problem,
                references=references,
                state=state,
                actor_id=actor_id,
            )
