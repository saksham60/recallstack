from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.practice.application.attempt_submission import PracticeAttemptRepository
from recallstack.modules.practice.infrastructure.attempt_submission_repository import (
    SqlAlchemyPracticeAttemptRepository,
)
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyPracticeAttemptUnitOfWork:
    def __init__(self, session_factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self.repository: PracticeAttemptRepository

    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        self.repository = SqlAlchemyPracticeAttemptRepository(self._session)
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
