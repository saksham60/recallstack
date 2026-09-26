from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession

# Register the existing profile FK target without coupling Knowledge repositories to identity ORM.
from recallstack.modules.identity.infrastructure import (
    sqlalchemy_models as identity_models,  # noqa: F401
)
from recallstack.modules.knowledge.application.ports import KnowledgeRepository
from recallstack.modules.knowledge.infrastructure.repositories import SqlAlchemyKnowledgeRepository
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyKnowledgeUnitOfWork:
    def __init__(self, session_factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._factory = session_factory
        self._session: AsyncSession | None = None
        self.repository: KnowledgeRepository

    async def __aenter__(self) -> Self:
        self._session = self._factory.create_session()
        self.repository = SqlAlchemyKnowledgeRepository(self._session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._session is not None:
            await self._session.close()

    async def commit(self) -> None:
        if self._session is None:
            raise RuntimeError("Unit of work has not been entered")
        await self._session.commit()
