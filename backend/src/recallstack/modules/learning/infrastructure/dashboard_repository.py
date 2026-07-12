from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.sqlalchemy_models import UserProgressModel


class SqlAlchemyLearningProgressReadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def for_content(
        self, profile_id: UUID, content_item_ids: frozenset[UUID]
    ) -> dict[UUID, LearningStatus]:
        if not content_item_ids:
            return {}
        statement = select(UserProgressModel.content_item_id, UserProgressModel.status).where(
            UserProgressModel.user_id == profile_id,
            UserProgressModel.content_item_id.in_(content_item_ids),
        )
        return {
            content_item_id: status
            for content_item_id, status in await self._session.execute(statement)
        }
