from datetime import datetime
from uuid import UUID

from sqlalchemy import case, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.knowledge.application.errors import invalid
from recallstack.modules.knowledge.domain.entities import RETENTION, StoryEvent
from recallstack.modules.knowledge.infrastructure.preference_repository import lock_profile
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeStoryModel as Story,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    StoryEventModel as Event,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    StoryStateModel as State,
)


async def record_events(
    session: AsyncSession,
    profile_id: UUID,
    events: tuple[StoryEvent, ...],
    now: datetime,
) -> int:
    await lock_profile(session, profile_id)
    story_ids = {event.story_id for event in events}
    valid = set(
        await session.scalars(
            select(Story.id)
            .where(
                Story.id.in_(story_ids),
                Story.status == "active",
                Story.published_at >= now - RETENTION,
                Story.published_at <= now,
            )
            .order_by(Story.id)
            .with_for_update(read=True, key_share=True)
        )
    )
    if valid != story_ids:
        raise invalid("One or more stories are unavailable")
    inserted = tuple(
        await session.scalars(
            insert(Event)
            .values(
                [
                    {
                        "id": event.event_id,
                        "profile_id": profile_id,
                        "story_id": event.story_id,
                        "event_type": event.type.value,
                        "occurred_at": event.occurred_at,
                        "created_at": now,
                    }
                    for event in events
                ]
            )
            .on_conflict_do_nothing(index_elements=[Event.id])
            .returning(Event.id)
        )
    )
    stored = {
        event.id: event
        for event in await session.scalars(
            select(Event).where(Event.id.in_([event.event_id for event in events]))
        )
    }
    for event in events:
        original = stored[event.event_id]
        if (original.profile_id, original.story_id, original.event_type, original.occurred_at) != (
            profile_id,
            event.story_id,
            event.type.value,
            event.occurred_at,
        ):
            raise invalid("eventId was already used with a different payload", status=409)
    if not inserted:
        return 0
    # Reconcile late/out-of-order batches on the write path, never the feed path.
    family = case(
        (Event.event_type == "VIEW", "seen"),
        (Event.event_type.in_(["SAVE", "UNSAVE"]), "saved"),
        else_="hidden",
    )
    latest = await session.scalars(
        select(Event)
        .where(
            Event.profile_id == profile_id,
            Event.story_id.in_(story_ids),
            Event.event_type.in_(["VIEW", "SAVE", "UNSAVE", "HIDE", "UNHIDE"]),
        )
        .distinct(Event.story_id, family)
        .order_by(
            Event.story_id,
            family,
            Event.occurred_at.desc(),
            Event.id.desc(),
        )
    )
    states: dict[UUID, dict[str, object]] = {}
    for latest_event in latest:
        state = states.setdefault(
            latest_event.story_id,
            {
                "profile_id": profile_id,
                "story_id": latest_event.story_id,
                "seen_at": None,
                "saved": False,
                "hidden": False,
                "updated_at": now,
            },
        )
        if latest_event.event_type == "VIEW":
            state["seen_at"] = latest_event.occurred_at
        elif latest_event.event_type in {"SAVE", "UNSAVE"}:
            state["saved"] = latest_event.event_type == "SAVE"
        else:
            state["hidden"] = latest_event.event_type == "HIDE"
    if states:
        statement = insert(State).values(list(states.values()))
        await session.execute(
            statement.on_conflict_do_update(
                index_elements=[State.profile_id, State.story_id],
                set_={
                    key: getattr(statement.excluded, key)
                    for key in ("seen_at", "saved", "hidden", "updated_at")
                },
            )
        )
    return len(inserted)
