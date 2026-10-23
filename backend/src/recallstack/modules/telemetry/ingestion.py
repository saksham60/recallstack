# SQL formatting is intentionally preserved for review.
# ruff: noqa: E501
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.telemetry.contract import REGISTRY, Batch, Receipt
from recallstack.shared.errors import AppError


async def ingest(session: AsyncSession, batch: Batch, user_id: UUID, environment: str) -> Receipt:
    now = datetime.now(UTC)
    if not await session.scalar(text("SELECT to_regclass('telemetry_private.product_events')")):
        raise AppError(
            error_type="telemetry-unavailable",
            title="Telemetry unavailable",
            status=503,
            detail="Install the reviewed telemetry migration before enabling collection.",
        )
    quota = await session.scalar(
        text("""
        INSERT INTO telemetry_private.ingestion_quotas(user_id,minute,events)
        VALUES (:user,date_trunc('minute',CAST(:now AS timestamptz)),:count)
        ON CONFLICT(user_id,minute) DO UPDATE
        SET events=telemetry_private.ingestion_quotas.events+excluded.events
        RETURNING events
    """),
        {"user": user_id, "now": now, "count": len(batch.events)},
    )
    if quota > 600:
        raise AppError(
            error_type="telemetry-rate-limit",
            title="Telemetry rate limit",
            status=429,
            detail="At most 600 events per account per minute are accepted.",
        )
    rows = []
    for event in batch.events:
        occurred = event.occurred_at.astimezone(UTC)
        valid = now - timedelta(days=7) <= occurred <= now + timedelta(minutes=5)
        delayed = valid and occurred < now - timedelta(minutes=5)
        entry = event.model_dump(mode="json")
        entry.update(
            user_id=str(user_id),
            environment=environment,
            feature=REGISTRY["events"][event.event_name]["feature"],
            engaged=REGISTRY["events"][event.event_name]["engaged"],
            effective_at=(min(occurred, now) if valid else now).isoformat(),
            clock_quality="delayed" if delayed else "plausible" if valid else "invalid",
        )
        rows.append(entry)
    inserted = (
        (
            await session.execute(
                text("""
      INSERT INTO telemetry_private.product_events
        (event_id,schema_version,user_id,session_id,journey_id,correlation_id,event_name,
         feature,source,environment,entity_id,occurred_at,effective_at,clock_quality,engaged,properties)
      SELECT event_id,schema_version,user_id,session_id,journey_id,correlation_id,event_name,
        feature,source,environment,entity_id,occurred_at,effective_at,clock_quality,engaged,properties
      FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS x(
        event_id uuid,schema_version int,user_id uuid,session_id uuid,journey_id uuid,
        correlation_id uuid,event_name text,feature text,source text,environment text,entity_id uuid,
        occurred_at timestamptz,effective_at timestamptz,clock_quality text,engaged boolean,properties jsonb)
      ON CONFLICT(event_id) DO NOTHING
      RETURNING session_id,source,event_name,properties,clock_quality
    """),
                {"rows": json.dumps(rows)},
            )
        )
        .mappings()
        .all()
    )
    sessions: dict[UUID, dict[str, Any]] = {}
    for row in inserted:
        item = sessions.setdefault(
            row["session_id"],
            {
                "user": user_id,
                "id": row["session_id"],
                "source": row["source"],
                "now": now,
                "active": 0,
                "count": 0,
                "ended": None,
                "version": None,
                "build": None,
                "os": None,
            },
        )
        item["count"] += 1
        if row["event_name"] == "session.active":
            item["active"] += row["properties"].get("active_seconds", 0)
        if row["event_name"] == "session.started":
            item.update(
                version=row["properties"].get("app_version"),
                build=row["properties"].get("build_version"),
                os=row["properties"].get("os_family"),
            )
        if row["event_name"] == "session.ended":
            item["ended"] = now
    if sessions:
        await session.execute(
            text("""
          INSERT INTO telemetry_private.user_sessions
            (user_id,session_id,source,started_at,last_received_at,active_seconds,event_count,
             ended_at,app_version,build_version,os_family)
          VALUES (:user,:id,:source,:now,:now,0,:count,:ended,:version,:build,:os)
          ON CONFLICT(user_id,session_id) DO UPDATE SET
            last_received_at=excluded.last_received_at,
            event_count=telemetry_private.user_sessions.event_count+excluded.event_count,
            active_seconds=least(telemetry_private.user_sessions.active_seconds+:active,
              greatest(0,extract(epoch from excluded.last_received_at-telemetry_private.user_sessions.started_at)::int)),
            ended_at=coalesce(excluded.ended_at,telemetry_private.user_sessions.ended_at),
            app_version=coalesce(excluded.app_version,telemetry_private.user_sessions.app_version),
            build_version=coalesce(excluded.build_version,telemetry_private.user_sessions.build_version),
            os_family=coalesce(excluded.os_family,telemetry_private.user_sessions.os_family)
        """),
            list(sessions.values()),
        )
    # First touch is accepted once, only close to genuine profile creation.
    for row in inserted:
        if row["event_name"] == "acquisition.first_touch":
            await session.execute(
                text("""
              INSERT INTO telemetry_private.user_acquisition(user_id,source,properties)
              SELECT id,:source,CAST(:properties AS jsonb) FROM profiles
              WHERE id=:user AND created_at BETWEEN :now-interval '1 day' AND :now
              ON CONFLICT(user_id) DO NOTHING
            """),
                {
                    "user": user_id,
                    "now": now,
                    "source": row["source"],
                    "properties": json.dumps(row["properties"]),
                },
            )
    duplicates = len(batch.events) - len(inserted)
    if inserted:
        await session.execute(
            text("""
          UPDATE telemetry_private.installation
          SET collection_started_at=coalesce(collection_started_at,:now) WHERE singleton
            AND collection_started_at IS NULL
        """),
            {"now": now},
        )
    await session.execute(
        text("""
      INSERT INTO telemetry_private.ingestion_health(day,accepted,duplicates,delayed,invalid_clocks,last_received_at)
      VALUES ((CAST(:now AS timestamptz) AT TIME ZONE 'UTC')::date,:accepted,:duplicates,:delayed,:invalid_clocks,:now)
      ON CONFLICT(day) DO UPDATE SET
        accepted=telemetry_private.ingestion_health.accepted+excluded.accepted,
        duplicates=telemetry_private.ingestion_health.duplicates+excluded.duplicates,
        delayed=telemetry_private.ingestion_health.delayed+excluded.delayed,
        invalid_clocks=telemetry_private.ingestion_health.invalid_clocks+excluded.invalid_clocks,
        last_received_at=excluded.last_received_at
    """),
        {
            "now": now,
            "accepted": len(inserted),
            "duplicates": duplicates,
            "delayed": sum(r["clock_quality"] == "delayed" for r in inserted),
            "invalid_clocks": sum(r["clock_quality"] == "invalid" for r in inserted),
        },
    )
    return Receipt(accepted=len(inserted), duplicates=duplicates, received_at=now)
