from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.identity.domain.repository_ports import ProfileRepository, RoleRepository
from recallstack.modules.identity.infrastructure.repositories import (
    SqlAlchemyProfileRepository,
    SqlAlchemyRoleRepository,
)
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyIdentityUnitOfWork:
    def __init__(self, session_factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self.profiles: ProfileRepository
        self.roles: RoleRepository

    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        self.profiles = SqlAlchemyProfileRepository(self._session)
        self.roles = SqlAlchemyRoleRepository(self._session)
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
        await self._session.commit()

    async def rollback(self) -> None:
        if self._session is None:
            raise RuntimeError("Unit of work has not been entered")
        await self._session.rollback()
