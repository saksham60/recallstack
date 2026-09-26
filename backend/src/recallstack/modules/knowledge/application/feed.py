import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from recallstack.modules.knowledge.application.cursor import (
    CursorCodec,
    FeedCursor,
    preference_fingerprint,
)
from recallstack.modules.knowledge.application.errors import invalid
from recallstack.modules.knowledge.application.ports import FeedPosition, UnitOfWorkFactory
from recallstack.modules.knowledge.domain.entities import KnowledgeStory
from recallstack.modules.knowledge.domain.ranking import RankingPolicy, normalize_topic
from recallstack.shared.errors import AppError

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class FeedPage:
    items: tuple[KnowledgeStory, ...]
    next_cursor: str | None
    has_more: bool


class FeedService:
    def __init__(
        self,
        uow: UnitOfWorkFactory,
        codec: CursorCodec,
        *,
        default_limit: int = 20,
        max_limit: int = 50,
        policy: RankingPolicy | None = None,
    ) -> None:
        self._uow, self._codec, self._policy = uow, codec, policy or RankingPolicy()
        self._default_limit, self._max_limit = default_limit, max_limit

    async def query(
        self,
        profile_id: UUID,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        topic: str | None = None,
    ) -> FeedPage:
        started = time.perf_counter()
        limit = self._default_limit if limit is None else limit
        if not 1 <= limit <= self._max_limit:
            raise invalid(f"limit must be between 1 and {self._max_limit}")
        try:
            topic = normalize_topic(topic) if topic is not None else None
        except ValueError as exc:
            raise invalid(str(exc)) from None
        now = datetime.now(UTC)
        async with self._uow() as uow:
            preferences = await uow.repository.preferences(profile_id)
            sources = await uow.repository.sources()
            fingerprint = preference_fingerprint(preferences, sources, self._policy)
            decoded = (
                self._codec.decode(
                    cursor,
                    profile_id=profile_id,
                    topic=topic,
                    fingerprint=fingerprint,
                    now=now,
                )
                if cursor
                else None
            )
            anchor = decoded.anchor if decoded else now
            rows = await uow.repository.feed(
                profile_id=profile_id,
                preferences=preferences,
                anchor=anchor,
                now=now,
                topic=topic,
                after=decoded.position if decoded else None,
                limit=limit + 1,
                policy=self._policy,
            )
        has_more, rows = len(rows) > limit, rows[:limit]
        next_cursor = None
        if has_more:
            last = rows[-1]
            next_cursor = self._codec.encode(
                FeedCursor(
                    anchor, FeedPosition(last.score, last.story.published_at, last.story.id)
                ),
                profile_id=profile_id,
                topic=topic,
                fingerprint=fingerprint,
            )
        logger.info(
            "knowledge_feed",
            extra={
                "stage": "feed",
                "item_count": len(rows),
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        return FeedPage(tuple(row.story for row in rows), next_cursor, has_more)

    async def story(self, story_id: UUID) -> KnowledgeStory:
        async with self._uow() as uow:
            story = await uow.repository.story(story_id, datetime.now(UTC))
        if story is None:
            raise AppError(
                error_type="knowledge-story-not-found",
                title="Story not found",
                status=404,
                detail="The story is unavailable",
            )
        return story
