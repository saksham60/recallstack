import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    ActivityEventModel,
    UserProgressModel,
)
from recallstack.shared.database import DatabaseSessionFactory
from recallstack.shared.events import DomainEvent, EventPublisher

logger = logging.getLogger(__name__)


class SqlAlchemyActivityEventRecorder:
    def __init__(
        self,
        session_factory: DatabaseSessionFactory[AsyncSession],
        publisher: EventPublisher | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._publisher = publisher

    async def record_content_opened(
        self,
        *,
        profile_id: UUID,
        content_item_id: UUID,
        published_version_number: int,
    ) -> None:
        event_id = uuid4()
        occurred_at = datetime.now(UTC)
        async with self._session_factory.create_session() as session, session.begin():
            session.add(
                ActivityEventModel(
                    user_id=profile_id,
                    content_item_id=content_item_id,
                    event_type="content_opened",
                    source_entity_type="content_item",
                    source_entity_id=content_item_id,
                    metadata_={"published_version_number": published_version_number},
                    occurred_at=occurred_at,
                )
            )
            await session.execute(
                update(UserProgressModel)
                .where(
                    UserProgressModel.user_id == profile_id,
                    UserProgressModel.content_item_id == content_item_id,
                )
                .values(last_opened_at=occurred_at, updated_at=func.now())
            )
        if self._publisher is None:
            return
        try:
            await self._publisher.publish(
                (
                    DomainEvent(
                        event_id=event_id,
                        event_type="content_opened",
                        occurred_at=occurred_at,
                        payload={
                            "profile_id": str(profile_id),
                            "content_item_id": str(content_item_id),
                            "published_version_number": str(published_version_number),
                        },
                    ),
                )
            )
        except Exception:
            logger.warning(
                "content_opened_publish_failed",
                extra={"content_item_id": str(content_item_id)},
                exc_info=True,
            )
