"""Disposable PostgreSQL fixture benchmark and independent KPI reconciliation.

No production credentials, network product traffic or provider calls are used.
"""

# ruff: noqa: E501
import asyncio
import hashlib
import json
import statistics
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from testcontainers.postgres import PostgresContainer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from recallstack.modules.telemetry.repository import IntelligenceRepository
from recallstack.shared.database.event_loop import configure_psycopg_event_loop
from tests.integration.test_product_intelligence import telemetry_db

REPOSITORY_SHA256 = hashlib.sha256(
    (
        Path(__file__).resolve().parents[1] / "src/recallstack/modules/telemetry/repository.py"
    ).read_bytes()
).hexdigest()


async def measure(url: str) -> dict:
    engine = create_async_engine(url)
    samples = []
    last = None
    try:
        for _ in range(10):
            async with AsyncSession(engine) as session:
                started = perf_counter()
                last = await IntelligenceRepository(session).overview(30, None, False)
                samples.append(round((perf_counter() - started) * 1000, 3))
        assert last
        async with AsyncSession(engine) as session:
            expected = (
                (
                    await session.execute(
                        text("""
              SELECT (SELECT count(*) FROM profiles)::int registered_users,
                count(*)::int server_submits,
                count(*) FILTER(WHERE status='completed' AND result->>'verdict'='accepted' AND plan->>'certificateId' IS NOT NULL)::int official_accepted,
                count(DISTINCT(user_id,request->>'problemId')) FILTER(WHERE status='completed' AND result->>'verdict'='accepted' AND plan->>'certificateId' IS NOT NULL)::int official_solves
              FROM dsa_execution_private.jobs WHERE request->>'mode'='submit'
            """)
                    )
                )
                .mappings()
                .one()
            )
            comparisons = [
                {
                    "metric": k,
                    "expected": v,
                    "actual": last.metrics[k].value,
                    "passed": v == last.metrics[k].value,
                }
                for k, v in expected.items()
            ]
            assert all(item["passed"] for item in comparisons)
            plan = [
                r[0]
                for r in (
                    await session.execute(
                        text("""
              EXPLAIN (ANALYZE,BUFFERS) SELECT event_id FROM telemetry_private.product_events
              WHERE user_id=(SELECT id FROM profiles LIMIT 1) AND effective_at>=now()-interval '30 days'
              ORDER BY effective_at DESC,event_id DESC LIMIT 30
            """)
                    )
                ).all()
            ]
        return {
            "fixture": True,
            "measured_at": datetime.now(UTC).isoformat(),
            "repository_sha256": REPOSITORY_SHA256,
            "users": 100,
            "client_events": 10000,
            "judge_jobs": 500,
            "read_path": "IntelligenceRepository.overview, 30 days, PostgreSQL 17, loopback",
            "samples_ms": samples,
            "p50_ms": statistics.median(samples),
            "p95_ms": sorted(samples)[-1],
            "p95_method": "nearest rank, n=10",
            "reconciliation": comparisons,
            "timeline_query_plan": plan,
            "limits": "Synthetic metadata fixture, not production latency, throughput or browser timing.",
        }
    finally:
        await engine.dispose()


def main() -> None:
    configure_psycopg_event_loop()
    with PostgresContainer("postgres:17.6-bookworm", driver="psycopg") as pg:
        fixture = telemetry_db.__wrapped__(pg.get_connection_url())
        url = next(fixture)
        engine = create_engine(url)
        try:
            with engine.begin() as c:
                c.execute(
                    text("""
                  INSERT INTO profiles(id,display_name) SELECT gen_random_uuid(),'Benchmark fixture' FROM generate_series(1,100);
                  INSERT INTO telemetry_private.product_events
                    (event_id,schema_version,user_id,session_id,event_name,feature,source,environment,occurred_at,effective_at,clock_quality,engaged,properties)
                    SELECT gen_random_uuid(),1,p.id,gen_random_uuid(),'dsa.problem_opened','dsa','web','test',
                      now()-s.n*interval '1 second',now()-s.n*interval '1 second','plausible',false,'{}'
                    FROM profiles p CROSS JOIN generate_series(1,100) s(n);
                  UPDATE telemetry_private.installation SET collection_started_at=now();
                  INSERT INTO dsa_execution_private.jobs(id,user_id,request,status,result,plan)
                    SELECT gen_random_uuid(),id,jsonb_build_object('mode','submit','problemId',id::text),
                      'completed',jsonb_build_object('verdict',CASE WHEN n<=3 THEN 'accepted' ELSE 'wrong_answer' END),
                      '{"certificateId":"fixture-only","gradingLevel":"official"}'::jsonb
                    FROM profiles CROSS JOIN generate_series(1,5) s(n);
                  ANALYZE telemetry_private.product_events;
                """)
                )
            report = asyncio.run(measure(url))
            output = (
                Path(__file__).resolve().parents[2]
                / "docs/evidence/runs/2026-10-22/product-intelligence/benchmark.json"
            )
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(report, indent=2), encoding="utf-8")
            print(
                json.dumps(
                    {k: report[k] for k in ("fixture", "p50_ms", "p95_ms", "reconciliation")},
                    indent=2,
                )
            )
        finally:
            engine.dispose()
            try:
                next(fixture)
            except StopIteration:
                pass


if __name__ == "__main__":
    main()
