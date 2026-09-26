from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

RETENTION = timedelta(days=7)


class EventType(StrEnum):
    VIEW = "VIEW"
    OPEN = "OPEN"
    SAVE = "SAVE"
    UNSAVE = "UNSAVE"
    HIDE = "HIDE"
    UNHIDE = "UNHIDE"
    SHARE = "SHARE"
    ASK_REASONAI = "ASK_REASONAI"


@dataclass(frozen=True, slots=True)
class KnowledgeSource:
    id: UUID
    key: str
    name: str
    source_type: str
    enabled: bool
    quality_weight: Decimal


@dataclass(frozen=True, slots=True)
class KnowledgeStory:
    id: UUID
    source: KnowledgeSource
    canonical_url: str
    canonical_hash: str
    title: str
    summary: str
    why_it_matters: str
    image_url: str
    image_key: str
    published_at: datetime
    discovered_at: datetime
    importance_score: Decimal
    quality_score: Decimal
    topics: tuple[str, ...]
    bullets: tuple[str, ...] = ()
    external_id: str | None = None
    status: str = "active"


@dataclass(frozen=True, slots=True)
class TopicPreference:
    topic: str
    weight: Decimal = Decimal("1")
    blocked: bool = False


@dataclass(frozen=True, slots=True)
class SourcePreference:
    key: str
    enabled: bool = True
    weight: Decimal = Decimal("1")


@dataclass(frozen=True, slots=True)
class Preferences:
    minimum_importance: Decimal = Decimal("0")
    topics: tuple[TopicPreference, ...] = ()
    sources: tuple[SourcePreference, ...] = ()


@dataclass(frozen=True, slots=True)
class PreferencePatch:
    minimum_importance: Decimal | None = None
    topics: tuple[TopicPreference, ...] | None = None
    sources: tuple[SourcePreference, ...] | None = None


@dataclass(frozen=True, slots=True)
class StoryEvent:
    event_id: UUID
    story_id: UUID
    type: EventType
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class DiscoveryCandidate:
    source_key: str
    url: str
    title: str
    content: str
    published_at: datetime | None
    image_url: str | None = None
    external_id: str | None = None


@dataclass(frozen=True, slots=True)
class ProcessedContent:
    title: str
    summary: str
    why_it_matters: str
    topics: tuple[str, ...]
    importance_score: Decimal
    quality_score: Decimal
    bullets: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ExpiredStory:
    id: UUID
    image_key: str
    published_at: datetime


@dataclass(frozen=True, slots=True)
class StoryIdentity:
    canonical_hash: str
    title: str
    canonical_url: str
    published_at: datetime
