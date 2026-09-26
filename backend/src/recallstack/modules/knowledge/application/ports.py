from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from recallstack.modules.knowledge.domain.entities import (
    DiscoveryCandidate,
    ExpiredStory,
    KnowledgeSource,
    KnowledgeStory,
    PreferencePatch,
    Preferences,
    ProcessedContent,
    StoryEvent,
    StoryIdentity,
)
from recallstack.modules.knowledge.domain.ranking import RankingPolicy


@dataclass(frozen=True, slots=True)
class FeedPosition:
    score: Decimal
    published_at: datetime
    story_id: UUID


@dataclass(frozen=True, slots=True)
class RankedStory:
    story: KnowledgeStory
    score: Decimal


class KnowledgeRepository(Protocol):
    async def sources(self) -> tuple[KnowledgeSource, ...]: ...
    async def preferences(self, profile_id: UUID) -> Preferences: ...
    async def patch_preferences(self, profile_id: UUID, patch: PreferencePatch) -> Preferences: ...
    async def feed(
        self,
        *,
        profile_id: UUID,
        preferences: Preferences,
        anchor: datetime,
        now: datetime,
        topic: str | None,
        after: FeedPosition | None,
        limit: int,
        policy: RankingPolicy,
    ) -> tuple[RankedStory, ...]: ...
    async def story(self, story_id: UUID, now: datetime) -> KnowledgeStory | None: ...
    async def record_events(
        self,
        profile_id: UUID,
        events: tuple[StoryEvent, ...],
        now: datetime,
    ) -> int: ...


class KnowledgeUnitOfWork(Protocol):
    @property
    def repository(self) -> KnowledgeRepository: ...
    async def __aenter__(self) -> Self: ...
    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...
    async def commit(self) -> None: ...


UnitOfWorkFactory = Callable[[], KnowledgeUnitOfWork]


class StoryStore(Protocol):
    """Job operations each own a short transaction; no session spans provider I/O."""

    async def sources(self) -> tuple[KnowledgeSource, ...]: ...
    async def identities(
        self, after: UUID | None, limit: int
    ) -> tuple[tuple[UUID, StoryIdentity], ...]: ...
    async def contains(self, canonical_hash: str) -> bool: ...
    async def persist(self, story: KnowledgeStory) -> bool: ...
    async def expired(
        self,
        cutoff: datetime,
        after: tuple[datetime, UUID] | None,
        limit: int,
    ) -> tuple[ExpiredStory, ...]: ...
    async def remove_expired(self, ids: tuple[UUID, ...], cutoff: datetime) -> int: ...


class StoryDiscoveryProvider(Protocol):
    @property
    def name(self) -> str: ...
    @property
    def source_key(self) -> str: ...
    async def discover(self, limit: int) -> tuple[DiscoveryCandidate, ...]: ...


class CandidateEnricher(Protocol):
    async def enrich(self, candidate: DiscoveryCandidate) -> DiscoveryCandidate: ...


class StoryProcessor(Protocol):
    async def process(self, candidate: DiscoveryCandidate) -> ProcessedContent: ...


class ImageProcessor(Protocol):
    async def process(self, url: str) -> bytes: ...


class ImageStore(Protocol):
    def public_url(self, key: str) -> str: ...
    async def put(self, key: str, content: bytes) -> None: ...
    async def delete(self, keys: tuple[str, ...]) -> frozenset[str]: ...
