"""Opt-in verification of the external schema. All data writes roll back; never runs migrations."""

import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import event, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from recallstack.composition.knowledge_job import refresh_lock
from recallstack.composition.knowledge_uow import SqlAlchemyKnowledgeUnitOfWork
from recallstack.modules.knowledge.application.cleanup import CleanupService
from recallstack.modules.knowledge.application.cursor import CursorCodec
from recallstack.modules.knowledge.application.events import EventService
from recallstack.modules.knowledge.application.feed import FeedService
from recallstack.modules.knowledge.application.preferences import PreferenceService
from recallstack.modules.knowledge.domain.entities import (
    EventType,
    PreferencePatch,
    SourcePreference,
    StoryEvent,
    TopicPreference,
)
from recallstack.modules.knowledge.domain.ranking import RankingPolicy
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeSourceModel as Source,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeStoryModel as Story,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    PreferencesModel as Pref,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    StoryEventModel as Event,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    StoryStateModel as State,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    StoryTopicModel as Topic,
)
from recallstack.modules.knowledge.infrastructure.story_store import SqlAlchemyStoryStore
from recallstack.shared.config import Settings
from recallstack.shared.database import SqlAlchemySessionFactory
from recallstack.shared.errors import AppError
from tests.knowledge.fakes import FakeImages
from tests.knowledge.fakes import story as sample_story

pytestmark = pytest.mark.integration


@pytest.fixture
def contract_url(request):
    if os.getenv("RUN_KNOWLEDGE_CONTRACT_TESTS") == "1":
        url = Settings().database_url
        assert url, "DATABASE_URL required for external schema contract tests"
        return url
    return request.getfixturevalue("migrated_database_url")


@pytest.fixture
async def contract(contract_url):
    engine = create_async_engine(contract_url, poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                expected = (
                    "knowledge_sources",
                    "knowledge_stories",
                    "knowledge_story_topics",
                    "user_knowledge_preferences",
                    "user_knowledge_topics",
                    "user_knowledge_sources",
                    "user_story_events",
                    "user_story_state",
                )
                found = set(
                    await connection.scalars(
                        text(
                            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
                        )
                    )
                )
                if missing := set(expected) - found:
                    pytest.skip(
                        "External Knowledge migration missing: " + ", ".join(sorted(missing))
                    )
                # Timeouts keep failures bounded; no DDL, credentials, or provider calls.
                await connection.execute(text("SET LOCAL statement_timeout = '20s'"))
                user, other, source_id = uuid4(), uuid4(), uuid4()
                now, scope = datetime.now(UTC), "test-" + uuid4().hex
                await connection.execute(
                    text("INSERT INTO auth.users (id) VALUES (:u), (:v)"), {"u": user, "v": other}
                )
                await connection.execute(
                    text("INSERT INTO profiles (id) VALUES (:u), (:v)"), {"u": user, "v": other}
                )
                await connection.execute(
                    insert(Source).values(
                        id=source_id,
                        key=scope,
                        name="Rollback contract test",
                        source_type="web",
                        enabled=True,
                        quality_weight=1,
                        created_at=now,
                        updated_at=now,
                    )
                )
                ids = tuple(uuid4() for _ in range(8))
                for index, sid in enumerate(ids):
                    await connection.execute(
                        insert(Story).values(
                            id=sid,
                            source_id=source_id,
                            canonical_url=f"https://example.com/{sid}",
                            canonical_hash=sid.hex * 2,
                            title=f"Engineering story {index}",
                            summary="Technical summary",
                            why_it_matters="Technical implications",
                            bullets=[],
                            image_url=f"https://cdn.example.com/{sid}.webp",
                            image_key=f"shorts/test/{sid}.webp",
                            importance_score=Decimal("0.8"),
                            quality_score=Decimal("0.9"),
                            published_at=now - timedelta(days=8)
                            if index == 5
                            else now - timedelta(hours=1),
                            discovered_at=now - timedelta(minutes=2),
                            created_at=now - timedelta(minutes=2),
                            updated_at=now,
                            status="expired" if index == 6 else "active",
                        )
                    )
                    await connection.execute(
                        insert(Topic).values(story_id=sid, topic=scope, confidence=1)
                    )
                await connection.execute(
                    insert(Topic).values(story_id=ids[0], topic="rust", confidence=1)
                )
                await connection.execute(
                    insert(State).values(
                        profile_id=user, story_id=ids[7], hidden=True, saved=False, updated_at=now
                    )
                )
                factory = SqlAlchemySessionFactory(
                    async_sessionmaker(
                        bind=connection,
                        expire_on_commit=False,
                        autoflush=False,
                        join_transaction_mode="create_savepoint",
                    )
                )
                yield connection, factory, user, other, source_id, scope, ids
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


async def test_actual_schema_feed_filters_ranking_cursor_and_query_count(contract):
    connection, factory, user, other, source_id, scope, ids = contract

    def uow():
        return SqlAlchemyKnowledgeUnitOfWork(factory)

    preferences = PreferenceService(uow)
    feed = FeedService(uow, CursorCodec("rollback-contract-cursor-32-characters"))
    await preferences.patch(user, PreferencePatch(topics=(TopicPreference("rust"),)))
    statements = []

    def count(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(connection.sync_connection, "before_cursor_execute", count)
    try:
        first = await feed.query(user, topic=scope, limit=2)
    finally:
        event.remove(connection.sync_connection, "before_cursor_execute", count)
    assert len(statements) == 6
    assert first.items[0].id == ids[0]
    anchor = datetime.now(UTC)
    async with uow() as unit:
        prefs = await unit.repository.preferences(user)
        ranked = await unit.repository.feed(
            profile_id=user,
            preferences=prefs,
            anchor=anchor,
            now=anchor,
            topic=scope,
            after=None,
            limit=2,
            policy=RankingPolicy(),
        )
    expected = RankingPolicy().score(
        importance=Decimal("0.8"),
        quality=Decimal("0.9"),
        source_quality=Decimal(1),
        topic_preference=Decimal(1),
        source_preference=Decimal(0),
        age_seconds=Decimal(str((anchor - ranked[0].story.published_at).total_seconds())),
    )
    assert ranked[0].score == expected
    seen = [s.id for s in first.items]
    page = first
    while page.has_more:
        page = await feed.query(user, topic=scope, limit=2, cursor=page.next_cursor)
        seen.extend(s.id for s in page.items)
    assert len(seen) == len(set(seen)) == 5 and set(seen) == set(ids[:5])
    for sid in ids[5:7]:
        with pytest.raises(AppError) as missing:
            await feed.story(sid)
        assert missing.value.status == 404
    await preferences.patch(user, PreferencePatch(topics=(TopicPreference(scope, blocked=True),)))
    assert not (await feed.query(user, topic=scope)).items
    with pytest.raises(AppError) as changed:
        await feed.query(user, topic=scope, cursor=first.next_cursor)
    assert changed.value.status == 409
    await preferences.patch(
        user, PreferencePatch(topics=(), sources=(SourcePreference(scope, False),))
    )
    assert not (await feed.query(user, topic=scope)).items
    assert (await preferences.get(other)).topics == ()
    # Global source disable applies regardless of the user's preferences.
    await connection.execute(
        Source.__table__.update().where(Source.id == source_id).values(enabled=False)
    )
    assert not (await feed.query(other, topic=scope)).items


async def test_actual_schema_events_idempotency_ordering_and_owner_checks(contract):
    connection, factory, user, other, _, _, ids = contract
    service = EventService(lambda: SqlAlchemyKnowledgeUnitOfWork(factory))
    now = datetime.now(UTC)
    batch = tuple(
        StoryEvent(uuid4(), ids[0], kind, now - timedelta(seconds=4 - i))
        for i, kind in enumerate((EventType.VIEW, EventType.SAVE, EventType.HIDE, EventType.UNSAVE))
    )
    assert await service.record(user, batch) == 4
    assert await service.record(user, batch) == 0
    await service.record(
        user, (StoryEvent(uuid4(), ids[0], EventType.SAVE, now - timedelta(minutes=1)),)
    )
    state = (
        await connection.execute(
            select(State.__table__).where(State.profile_id == user, State.story_id == ids[0])
        )
    ).one()
    assert state.hidden and not state.saved and state.seen_at is not None
    with pytest.raises(AppError) as conflict:
        await service.record(other, batch)
    assert conflict.value.status == 409
    await service.record(user, (StoryEvent(uuid4(), ids[0], EventType.UNHIDE, now),))
    assert (
        await connection.scalar(
            select(State.hidden).where(State.profile_id == user, State.story_id == ids[0])
        )
        is False
    )
    with pytest.raises(AppError):
        await service.record(user, (StoryEvent(uuid4(), ids[5], EventType.VIEW, now),))


async def test_actual_schema_cleanup_cascades_and_preferences_survive(contract):
    connection, factory, user, _, _, _, ids = contract
    now = datetime.now(UTC)
    await PreferenceService(lambda: SqlAlchemyKnowledgeUnitOfWork(factory)).patch(
        user, PreferencePatch()
    )
    await connection.execute(
        insert(Event).values(
            id=uuid4(),
            profile_id=user,
            story_id=ids[5],
            event_type="SAVE",
            occurred_at=now,
            created_at=now,
        )
    )
    await connection.execute(
        insert(State).values(
            profile_id=user, story_id=ids[5], saved=True, hidden=False, updated_at=now
        )
    )
    store = SqlAlchemyStoryStore(factory)

    # Limit this cleanup to our test row, never perform fake R2 deletes for unrelated rows.
    class ScopedStore(SqlAlchemyStoryStore):
        async def expired(self, cutoff, after, limit):
            from recallstack.modules.knowledge.domain.entities import ExpiredStory

            if after is not None:
                return ()
            row = (
                await connection.execute(
                    select(Story.id, Story.image_key, Story.published_at).where(Story.id == ids[5])
                )
            ).one_or_none()
            return (ExpiredStory(*row),) if row else ()

    images = FakeImages()
    images.fail_delete = True
    cleanup = CleanupService(ScopedStore(factory), images)
    assert (await cleanup.run(now)).removed == 0
    feed = FeedService(lambda: SqlAlchemyKnowledgeUnitOfWork(factory), CursorCodec("x" * 32))
    with pytest.raises(AppError):
        await feed.story(ids[5])
    images.fail_delete = False
    assert (await cleanup.run(now)).removed == 1
    assert (await cleanup.run(now)).removed == 0
    for model in (Event, State, Topic):
        assert not (
            await connection.execute(select(model.__table__).where(model.story_id == ids[5]))
        ).all()
    assert await connection.scalar(select(Pref.profile_id).where(Pref.profile_id == user)) == user
    assert await store.contains(ids[0].hex * 2)


async def test_actual_database_overlap_lock_releases(contract_url):
    async with refresh_lock(contract_url) as first:
        async with refresh_lock(contract_url) as second:
            assert first and not second
    with pytest.raises(RuntimeError):
        async with refresh_lock(contract_url) as acquired:
            assert acquired
            raise RuntimeError("simulated job failure")
    async with refresh_lock(contract_url) as acquired:
        assert acquired


async def test_actual_story_store_persistence_is_atomic_and_conflict_safe(contract):
    from dataclasses import replace

    from sqlalchemy.exc import DataError

    connection, factory, _, _, source_id, _, _ = contract
    store = SqlAlchemyStoryStore(factory)
    source = next(source for source in await store.sources() if source.id == source_id)
    first = replace(sample_story(), source=source, external_id="contract-external-id")
    assert await store.persist(first)
    assert not await store.persist(first)
    assert set(await connection.scalars(select(Topic.topic).where(Topic.story_id == first.id))) == {
        "databases"
    }
    duplicate_external = replace(sample_story(1), source=source, external_id=first.external_id)
    assert not await store.persist(duplicate_external)
    malformed = replace(sample_story(2), source=source, topics=("x" * 81,))
    with pytest.raises(DataError):
        await store.persist(malformed)
    assert not await store.contains(malformed.canonical_hash)
