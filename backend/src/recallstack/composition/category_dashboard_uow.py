from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.catalog.application.category_dashboard import (
    CatalogCategoryRepository,
    LearningProgressReadRepository,
    PublishedCategoryContentRepository,
)
from recallstack.modules.catalog.infrastructure.repositories import (
    SqlAlchemyCatalogCategoryRepository,
)
from recallstack.modules.content.infrastructure.dashboard_repository import (
    SqlAlchemyPublishedCategoryContentRepository,
)
from recallstack.modules.learning.infrastructure.dashboard_repository import (
    SqlAlchemyLearningProgressReadRepository,
)
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyCategoryDashboardUnitOfWork:
    def __init__(self, session_factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self.categories: CatalogCategoryRepository
        self.published_content: PublishedCategoryContentRepository
        self.progress: LearningProgressReadRepository

    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        self.categories = SqlAlchemyCatalogCategoryRepository(self._session)
        self.published_content = SqlAlchemyPublishedCategoryContentRepository(self._session)
        self.progress = SqlAlchemyLearningProgressReadRepository(self._session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._session is not None:
            await self._session.rollback()
            await self._session.close()
