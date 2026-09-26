from datetime import UTC, datetime, timedelta
from uuid import UUID

from recallstack.modules.knowledge.application.errors import invalid
from recallstack.modules.knowledge.application.ports import UnitOfWorkFactory
from recallstack.modules.knowledge.domain.entities import RETENTION, StoryEvent


class EventService:
    def __init__(self, uow: UnitOfWorkFactory) -> None:
        self._uow = uow

    async def record(self, profile_id: UUID, events: tuple[StoryEvent, ...]) -> int:
        now = datetime.now(UTC)
        if not 1 <= len(events) <= 100:
            raise invalid("A batch must contain 1-100 events")
        if len({event.event_id for event in events}) != len(events):
            raise invalid("eventId must be unique within a batch")
        if any(
            event.occurred_at.tzinfo is None
            or not now - RETENTION <= event.occurred_at <= now + timedelta(minutes=5)
            for event in events
        ):
            raise invalid("occurredAt must be within the last seven days (five minutes clock skew)")
        async with self._uow() as uow:
            inserted = await uow.repository.record_events(profile_id, events, now)
            await uow.commit()
        return inserted
