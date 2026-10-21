"""Production SELECT-only repository audit. No tokens, PII or user payloads in output."""
# SQL is formatted for PostgreSQL readability.
# ruff: noqa: E501

import asyncio
import json
import os
from datetime import timedelta
from pathlib import Path
from time import perf_counter

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from recallstack.modules.admin.infrastructure.analytics_repository import (
    SqlAlchemyAdminAnalyticsRepository,
)
from recallstack.modules.admin.presentation.analytics_schemas import (
    AdminUserListItem,
    GrowthResponse,
    OverviewResponse,
    ProblemDetailResponse,
    UserDetailResponse,
)
from recallstack.shared.config import Settings
from recallstack.shared.database.event_loop import configure_psycopg_event_loop


async def main():
    settings = Settings()
    engine = create_async_engine(settings.database_url, echo=False)
    statements = []

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def capture_statement(conn, cursor, statement, parameters, context, executemany):
        statements.append((statement, parameters))
    evidence = {
        "scope": "Live database; SELECT-only repeatable-read transaction; API authorization not bypassed or tested by this script",
        "growth": [],
        "checks": [],
    }
    try:
        async with engine.connect() as connection:
            await connection.execute(
                text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            )
            session = AsyncSession(bind=connection)
            repo = SqlAlchemyAdminAnalyticsRepository(session)
            for days in (7, 30, 90):
                start = perf_counter()
                data = GrowthResponse.model_validate(await repo.growth(days))
                elapsed = round((perf_counter() - start) * 1000, 2)
                sql, parameters = statements[-1]
                plan_result = await connection.exec_driver_sql(
                    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, parameters
                )
                plan = plan_result.scalar_one()[0]
                since = data.generated_at.replace(
                    hour=0, minute=0, second=0, microsecond=0
                ) - timedelta(days=days - 1)
                params = {"since": since, "until": data.generated_at}
                independent = (
                    (
                        await session.execute(
                            text("""
                  SELECT (SELECT count(*) FROM profiles WHERE created_at<=:until) total_users,
                    (SELECT count(*) FROM profiles WHERE created_at>=:since AND created_at<=:until) new_users,
                    (SELECT count(*) FROM reasonai_runs WHERE started_at>=:since AND started_at<=:until) ai_runs,
                    (SELECT count(*) FROM dsa_execution_private.jobs WHERE created_at>=:since AND created_at<=:until AND request->>'mode'='submit') server_submissions,
                    (SELECT count(*) FROM dsa_execution_private.jobs WHERE created_at>=:since AND created_at<=:until AND request->>'mode'='run') server_runs,
                    (SELECT count(*) FROM user_story_events WHERE occurred_at>=:since AND occurred_at<=:until) knowledge_events
                """),
                            params,
                        )
                    )
                    .mappings()
                    .one()
                )
                assert all(getattr(data, key) == value for key, value in independent.items())
                assert sum(p.signups for p in data.daily_signups) == data.new_users
                assert len(data.daily_signups) == days
                evidence["growth"].append(
                    {
                        "data": data.model_dump(mode="json"),
                        "repositoryMs": elapsed,
                        "explain": {
                            "executionMs": plan["Execution Time"],
                            "planningMs": plan["Planning Time"],
                            "rows": plan["Plan"]["Actual Rows"],
                            "sharedHitBlocks": plan["Plan"].get("Shared Hit Blocks", 0),
                        },
                        "independentCountChecks": dict(independent),
                        "passed": True,
                    }
                )
            overview = OverviewResponse.model_validate(await repo.overview())
            evidence["overview"] = overview.model_dump(mode="json")
            total, users = await repo.list_users(
                filters={}, offset=0, limit=5, sort_by="created_at", descending=True
            )
            assert total == overview.users.total
            for user in users:
                AdminUserListItem.model_validate(user)
            evidence["checks"].append(
                {"module": "users", "total": total, "pageItems": len(users), "schemaValid": True}
            )
            if users:
                user_id = users[0]["user_id"]
                UserDetailResponse.model_validate(await repo.user_detail(user_id))
                activity_total, activity = await repo.activity(
                    user_id, activity_type=None, from_date=None, to_date=None, offset=0, limit=25
                )
                evidence["checks"].append(
                    {
                        "module": "user detail/activity",
                        "schemaValid": True,
                        "timelineItems": len(activity),
                        "timelineTotal": activity_total,
                    }
                )
            total, problems = await repo.list_problems(
                filters={}, offset=0, limit=25, sort_by="attempts", descending=True
            )
            evidence["checks"].append(
                {"module": "problems", "total": total, "pageItems": len(problems)}
            )
            if problems:
                ProblemDetailResponse.model_validate(
                    await repo.problem_detail(problems[0]["problem_id"])
                )
                evidence["checks"].append({"module": "problem detail", "schemaValid": True})
            total, logs = await repo.audit_logs(filters={}, offset=0, limit=25)
            assert all(set(log["metadata_json"]) <= {"page", "page_size"} for log in logs)
            evidence["checks"].append(
                {
                    "module": "audit logs",
                    "total": total,
                    "pageItems": len(logs),
                    "allowlistValid": True,
                }
            )
            await connection.rollback()
    finally:
        await engine.dispose()
    out = Path(os.environ["LOCALAPPDATA"]) / "Temp/reasonai-admin-audit"
    out.mkdir(exist_ok=True)
    (out / "database-comparison.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    configure_psycopg_event_loop()
    asyncio.run(main())
