from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, literal, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.knowledge.domain.entities import (
    ExpiredStory,
    KnowledgeSource,
    KnowledgeStory,
    StoryIdentity,
)
from recallstack.modules.knowledge.infrastructure.mappers import source_to_domain
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeSourceModel as Source,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeStoryModel as Story,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    StoryTopicModel as Topic,
)
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyStoryStore:
    def __init__(self, factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._factory = factory

    async def sources(self) -> tuple[KnowledgeSource, ...]:
        async with self._factory.create_session() as session:
            return tuple(
                source_to_domain(source)
                for source in await session.scalars(select(Source).order_by(Source.key))
            )

    async def identities(
        self,
        after: UUID | None,
        limit: int,
    ) -> tuple[tuple[UUID, StoryIdentity], ...]:
        statement = (
            select(
                Story.id,
                Story.canonical_hash,
                Story.title,
                Story.canonical_url,
                Story.published_at,
            )
            .order_by(Story.id)
            .limit(limit)
        )
        if after is not None:
            statement = statement.where(Story.id > after)
        async with self._factory.create_session() as session:
            return tuple(
                (sid, StoryIdentity(digest, title, url, published))
                for sid, digest, title, url, published in await session.execute(statement)
            )

    async def contains(self, canonical_hash: str) -> bool:
        async with self._factory.create_session() as session:
            return (
                await session.scalar(
                    select(Story.id).where(
                        Story.canonical_hash == canonical_hash,
                    )
                )
                is not None
            )

    async def persist(self, story: KnowledgeStory) -> bool:
        now = datetime.now(UTC)
        async with self._factory.create_session() as session, session.begin():
            inserted = await session.scalar(
                insert(Story)
                .values(
                    id=story.id,
                    source_id=story.source.id,
                    external_id=story.external_id,
                    canonical_url=story.canonical_url,
                    canonical_hash=story.canonical_hash,
                    title=story.title,
                    summary=story.summary,
                    why_it_matters=story.why_it_matters,
                    bullets=list(story.bullets),
                    image_url=story.image_url,
                    image_key=story.image_key,
                    published_at=story.published_at,
                    discovered_at=story.discovered_at,
                    importance_score=story.importance_score,
                    quality_score=story.quality_score,
                    status=story.status,
                    created_at=now,
                    updated_at=now,
                )
                .on_conflict_do_nothing()
                .returning(Story.id)
            )
            if inserted is None:
                return False
            await session.execute(
                insert(Topic),
                [
                    {
                        "story_id": story.id,
                        "topic": topic,
                        "confidence": 1,
                    }
                    for topic in story.topics
                ],
            )
            return True

    async def expired(
        self,
        cutoff: datetime,
        after: tuple[datetime, UUID] | None,
        limit: int,
    ) -> tuple[ExpiredStory, ...]:
        statement = (
            select(Story.id, Story.image_key, Story.published_at)
            .where(
                Story.published_at < cutoff,
            )
            .order_by(Story.published_at, Story.id)
            .limit(limit)
        )
        if after is not None:
            statement = statement.where(
                tuple_(Story.published_at, Story.id) > tuple_(literal(after[0]), literal(after[1]))
            )
        async with self._factory.create_session() as session:
            return tuple(
                ExpiredStory(sid, key, published)
                for sid, key, published in (await session.execute(statement))
            )

    async def remove_expired(self, ids: tuple[UUID, ...], cutoff: datetime) -> int:
        if not ids:
            return 0
        async with self._factory.create_session() as session, session.begin():
            removed = await session.scalars(
                delete(Story)
                .where(
                    Story.id.in_(ids),
                    Story.published_at < cutoff,
                )
                .returning(Story.id)
            )
            return len(tuple(removed))
