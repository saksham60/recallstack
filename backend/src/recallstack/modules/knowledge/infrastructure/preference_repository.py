from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.knowledge.domain.entities import (
    PreferencePatch,
    Preferences,
    SourcePreference,
    TopicPreference,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    KnowledgeSourceModel as Source,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    PreferencesModel as Pref,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    SourcePreferenceModel as SP,
)
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import (
    TopicPreferenceModel as TP,
)


async def lock_profile(session: AsyncSession, profile_id: UUID) -> None:
    # Namespaced transaction lock serializes patches and event projections across instances.
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"knowledge-user:{profile_id}"},
    )


async def read_preferences(session: AsyncSession, profile_id: UUID) -> Preferences:
    minimum = await session.scalar(
        select(Pref.minimum_importance).where(Pref.profile_id == profile_id)
    )
    topics = tuple(
        TopicPreference(row.topic, row.weight, row.blocked)
        for row in (
            await session.scalars(select(TP).where(TP.profile_id == profile_id).order_by(TP.topic))
        )
    )
    sources = tuple(
        SourcePreference(key, enabled, weight)
        for key, enabled, weight in (
            await session.execute(
                select(Source.key, SP.enabled, SP.weight)
                .join(
                    Source,
                    Source.id == SP.source_id,
                )
                .where(SP.profile_id == profile_id)
                .order_by(Source.key)
            )
        )
    )
    return Preferences(minimum if minimum is not None else Decimal(0), topics, sources)


async def patch_preferences(
    session: AsyncSession,
    profile_id: UUID,
    patch: PreferencePatch,
) -> Preferences:
    await lock_profile(session, profile_id)
    now = datetime.now(UTC)
    statement = insert(Pref).values(
        profile_id=profile_id,
        minimum_importance=patch.minimum_importance or Decimal(0),
        created_at=now,
        updated_at=now,
    )
    updates: dict[str, object] = {"updated_at": now}
    if patch.minimum_importance is not None:
        updates["minimum_importance"] = patch.minimum_importance
    await session.execute(
        statement.on_conflict_do_update(index_elements=[Pref.profile_id], set_=updates)
    )
    if patch.topics is not None:
        await session.execute(delete(TP).where(TP.profile_id == profile_id))
        if patch.topics:
            await session.execute(
                insert(TP),
                [
                    {
                        "profile_id": profile_id,
                        "topic": pref.topic,
                        "weight": pref.weight,
                        "blocked": pref.blocked,
                        "created_at": now,
                        "updated_at": now,
                    }
                    for pref in patch.topics
                ],
            )
    if patch.sources is not None:
        sources = {key: sid for key, sid in await session.execute(select(Source.key, Source.id))}
        await session.execute(delete(SP).where(SP.profile_id == profile_id))
        if patch.sources:
            await session.execute(
                insert(SP),
                [
                    {
                        "profile_id": profile_id,
                        "source_id": sources[pref.key],
                        "weight": pref.weight,
                        "enabled": pref.enabled,
                        "created_at": now,
                        "updated_at": now,
                    }
                    for pref in patch.sources
                ],
            )
    return await read_preferences(session, profile_id)
