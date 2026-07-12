from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.content.application.published_study_note import (
    PublishedStudyNoteReadRepository,
)
from recallstack.modules.content.infrastructure.published_study_note_repository import (
    SqlAlchemyPublishedStudyNoteReadRepository,
)
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyPublishedStudyNoteUnitOfWork:
    def __init__(self, session_factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self.repository: PublishedStudyNoteReadRepository

    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        self.repository = SqlAlchemyPublishedStudyNoteReadRepository(self._session)
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
