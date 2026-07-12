from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True, slots=True)
class DomainEvent:
    event_id: UUID
    event_type: str
    occurred_at: datetime
    payload: dict[str, str]


class EventPublisher(Protocol):
    async def publish(self, events: tuple[DomainEvent, ...]) -> None: ...


EventHandler = Callable[[DomainEvent], Awaitable[None]]


class InProcessEventPublisher:
    def __init__(self) -> None:
        self._handlers: dict[str, list[EventHandler]] = {}

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    async def publish(self, events: tuple[DomainEvent, ...]) -> None:
        for event in events:
            for handler in self._handlers.get(event.event_type, []):
                await handler(event)
