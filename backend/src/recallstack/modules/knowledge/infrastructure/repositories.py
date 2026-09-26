from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, case, exists, func, literal, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from recallstack.modules.knowledge.application.ports import FeedPosition, RankedStory
from recallstack.modules.knowledge.domain.entities import (
    RETENTION,
    KnowledgeSource,
    KnowledgeStory,
    PreferencePatch,
    Preferences,
    StoryEvent,
)
from recallstack.modules.knowledge.domain.ranking import RankingPolicy
from recallstack.modules.knowledge.infrastructure.event_repository import record_events
from recallstack.modules.knowledge.infrastructure.mappers import source_to_domain, story_to_domain
from recallstack.modules.knowledge.infrastructure.preference_repository import (
    patch_preferences,
    read_preferences,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeSourceModel as Source,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeStoryModel as Story,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    StoryStateModel as State,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    StoryTopicModel as Topic,
)


def rank_expression(
    preferences: Preferences,
    anchor: datetime,
    policy: RankingPolicy,
) -> ColumnElement[Decimal]:
    followed = {p.topic: p.weight for p in preferences.topics if not p.blocked}
    topic_match: ColumnElement[Decimal] = literal(Decimal(0))
    if followed:
        topic_match = func.coalesce(
            select(func.max(case(followed, value=Topic.topic, else_=Decimal(0))))
            .where(Topic.story_id == Story.id)
            .correlate(Story)
            .scalar_subquery(),
            Decimal(0),
        )
    source_weights = {p.key: p.weight for p in preferences.sources if p.enabled}
    source_match = case(source_weights, value=Source.key, else_=Decimal(0)) if source_weights else 0
    freshness = 1 - func.extract("epoch", literal(anchor) - Story.published_at) / Decimal(604800)
    return func.round(
        policy.importance * Story.importance_score
        + policy.quality * Story.quality_score
        + policy.source_quality * Source.quality_weight
        + policy.topic_preference * topic_match
        + policy.source_preference * source_match
        + policy.freshness * freshness,
        8,
    )


class SqlAlchemyKnowledgeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def sources(self) -> tuple[KnowledgeSource, ...]:
        return tuple(
            source_to_domain(source)
            for source in (await self._session.scalars(select(Source).order_by(Source.key)))
        )

    async def preferences(self, profile_id: UUID) -> Preferences:
        return await read_preferences(self._session, profile_id)

    async def patch_preferences(self, profile_id: UUID, patch: PreferencePatch) -> Preferences:
        return await patch_preferences(self._session, profile_id, patch)

    async def record_events(
        self,
        profile_id: UUID,
        events: tuple[StoryEvent, ...],
        now: datetime,
    ) -> int:
        return await record_events(self._session, profile_id, events, now)

    async def _topics(self, ids: tuple[UUID, ...]) -> dict[UUID, tuple[str, ...]]:
        topics: dict[UUID, list[str]] = {story_id: [] for story_id in ids}
        if ids:
            for story_id, topic in await self._session.execute(
                select(Topic.story_id, Topic.topic)
                .where(Topic.story_id.in_(ids))
                .order_by(Topic.topic)
            ):
                topics[story_id].append(topic)
        return {key: tuple(value) for key, value in topics.items()}

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
    ) -> tuple[RankedStory, ...]:
        score = rank_expression(preferences, anchor, policy).label("score")
        statement = (
            select(Story, Source, score)
            .join(Source, Story.source_id == Source.id)
            .outerjoin(State, and_(State.story_id == Story.id, State.profile_id == profile_id))
            .where(
                Story.status == "active",
                Story.published_at >= now - RETENTION,
                Story.published_at <= anchor,
                Story.created_at <= anchor,
                Story.discovered_at <= anchor,
                Source.enabled.is_(True),
                func.coalesce(State.hidden, False).is_(False),
                Story.importance_score >= preferences.minimum_importance,
            )
        )
        blocked = [p.topic for p in preferences.topics if p.blocked]
        if blocked:
            statement = statement.where(
                ~exists().where(
                    Topic.story_id == Story.id,
                    Topic.topic.in_(blocked),
                )
            )
        disabled = [p.key for p in preferences.sources if not p.enabled]
        if disabled:
            statement = statement.where(Source.key.not_in(disabled))
        if topic is not None:
            statement = statement.where(
                exists().where(Topic.story_id == Story.id, Topic.topic == topic)
            )
        if after is not None:
            statement = statement.where(
                tuple_(score, Story.published_at, Story.id)
                < tuple_(literal(after.score), literal(after.published_at), literal(after.story_id))
            )
        rows = (
            await self._session.execute(
                statement.order_by(
                    score.desc(),
                    Story.published_at.desc(),
                    Story.id.desc(),
                ).limit(limit)
            )
        ).all()
        topics = await self._topics(tuple(row[0].id for row in rows))
        return tuple(
            RankedStory(story_to_domain(story, source, topics[story.id]), value)
            for story, source, value in rows
        )

    async def story(self, story_id: UUID, now: datetime) -> KnowledgeStory | None:
        row = (
            await self._session.execute(
                select(Story, Source)
                .join(Source, Story.source_id == Source.id)
                .where(
                    Story.id == story_id,
                    Story.status == "active",
                    Story.published_at >= now - RETENTION,
                    Story.published_at <= now,
                    Source.enabled.is_(True),
                )
            )
        ).one_or_none()
        if row is None:
            return None
        topics = await self._topics((story_id,))
        return story_to_domain(row[0], row[1], topics[story_id])
