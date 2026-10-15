from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Self

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.composition.learning_uow import SqlAlchemyLearningUnitOfWork
from recallstack.modules.dsa.infrastructure.learning_repository import DsaLearningRepository
from recallstack.modules.dsa.infrastructure.repositories import DsaReadRepository
from recallstack.shared.database import DatabaseSessionFactory


class DsaLearningUnitOfWork(SqlAlchemyLearningUnitOfWork):
    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        try:
            await self._session.execute(
                text(
                    "SELECT set_config('statement_timeout', '5s', true), "
                    "set_config('TimeZone', 'UTC', true)"
                )
            )
        except BaseException:
            await self._session.close()
            raise
        self.repository = DsaLearningRepository(
            self._session, sync_retention_days=self._sync_retention_days
        )
        return self


@asynccontextmanager
async def read_repository(
    factory: DatabaseSessionFactory[AsyncSession],
) -> AsyncIterator[DsaReadRepository]:
    async with factory.create_session() as session, session.begin():
        # Every DSA read is transactionally read-only, including the live smoke path.
        await session.execute(text("SET TRANSACTION READ ONLY"))
        await session.execute(
            text(
                "SELECT set_config('statement_timeout', '5s', true), "
                "set_config('TimeZone', 'UTC', true)"
            )
        )
        yield DsaReadRepository(session)
