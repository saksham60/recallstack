"""Real isolated PostgreSQL + authenticated HTTP ingestion → Admin reconciliation."""

# Test DDL uses literal table names and a generated local-only database name.
# ruff: noqa: E501, S608
import json
import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from recallstack.main import create_app
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.modules.telemetry.contract import REGISTRY, Batch
from recallstack.modules.telemetry.ingestion import ingest
from recallstack.modules.telemetry.repository import IntelligenceRepository
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def telemetry_db(postgres_url):
    url = make_url(postgres_url.replace("postgresql+psycopg2://", "postgresql+psycopg://"))
    assert url.host in {"localhost", "127.0.0.1", "::1"}
    name = "telemetry_" + uuid4().hex
    root = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with root.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    local = url.set(database=name).render_as_string(hide_password=False)
    engine = create_engine(local)
    with engine.begin() as c:
        c.execute(
            text("""
          DO $$ BEGIN
            IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
            IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
            IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
          END $$;
          CREATE TABLE profiles(id uuid PRIMARY KEY,created_at timestamptz DEFAULT now(),display_name text,email text);
          CREATE TABLE content_items(id uuid PRIMARY KEY,difficulty text,slug text,current_published_version_id uuid);
          CREATE TABLE content_versions(id uuid PRIMARY KEY,title text);
          CREATE TABLE topics(id uuid PRIMARY KEY,name text);
          CREATE TABLE content_version_topics(content_item_id uuid,content_version_id uuid,topic_id uuid);
          CREATE SCHEMA dsa_execution_private;
          CREATE TABLE dsa_execution_private.jobs(id uuid PRIMARY KEY,user_id uuid,created_at timestamptz DEFAULT now(),request jsonb,status text,result jsonb,plan jsonb,phase text DEFAULT 'prepared',attempts int DEFAULT 0);
          CREATE TABLE reasonai_conversations(id uuid PRIMARY KEY,user_id uuid,surface text);
          CREATE TABLE reasonai_runs(id uuid PRIMARY KEY,conversation_id uuid,started_at timestamptz,status text,error_code text,completed_at timestamptz);
          CREATE TABLE user_story_events(id uuid PRIMARY KEY,profile_id uuid,story_id uuid,event_type text,occurred_at timestamptz);
          CREATE TABLE dsa_code_intelligence_reports(id uuid PRIMARY KEY,user_id uuid,problem_id uuid,created_at timestamptz,generation_status text);
          CREATE TABLE diagrams(id uuid PRIMARY KEY,owner_id uuid,created_at timestamptz,revision int);
          CREATE TABLE admin_audit_logs(id bigserial PRIMARY KEY,admin_user_id uuid,action text,resource_type text,resource_id text,request_method text,request_path text,request_id text,metadata_json jsonb,created_at timestamptz DEFAULT now());
        """)
        )
    migration = (
        Path(__file__).resolve().parents[3]
        / "web/supabase/migrations/20261022134712_product_intelligence_v2.sql"
    )
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
        c.execute(text(migration.read_text()))
    yield local
    engine.dispose()
    with root.connect() as c:
        c.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
    root.dispose()


def event(name="dsa.problem_opened", **changes):
    return {
        "event_id": str(uuid4()),
        "schema_version": 1,
        "event_name": name,
        "session_id": str(uuid4()),
        "journey_id": str(uuid4()),
        "occurred_at": datetime.now(UTC).isoformat(),
        "source": "web",
        "properties": {},
        **changes,
    }


async def test_first_touch_new_signup_retry_immutability_and_admin_projection(telemetry_db):
    engine = create_async_engine(telemetry_db)
    user, old_user = uuid4(), uuid4()
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co", app_env="test", database_url=None
        )
    )
    app.state.telemetry_session_factory = SimpleNamespace(
        create_session=lambda: AsyncSession(engine)
    )
    app.state.telemetry_environment = "test"
    current = user
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        current, current, frozenset({"admin"})
    )
    props = {
        "utm_source": "devpost",
        "utm_medium": "referral",
        "utm_campaign": "hackathon",
        "landing": "home",
    }
    batch = {"events": [event("acquisition.first_touch", properties=props)]}
    try:
        async with engine.begin() as c:
            await c.execute(text("INSERT INTO profiles(id) VALUES(:id)"), {"id": user})
            await c.execute(
                text("INSERT INTO profiles(id,created_at) VALUES(:id,now()-interval '2 days')"),
                {"id": old_user},
            )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/api/v1/telemetry/events", json=batch)
            assert response.status_code == 200, response.text
            assert (await client.post("/api/v1/telemetry/events", json=batch)).json()[
                "duplicates"
            ] == 1
            # A later source cannot change the immutable signup attribution.
            later = {
                "events": [event("acquisition.first_touch", properties={"utm_source": "youtube"})]
            }
            assert (await client.post("/api/v1/telemetry/events", json=later)).status_code == 200
            details = await client.get(f"/api/v1/admin/users/{user}/features?days=7")
            assert details.status_code == 200, details.text
            assert details.json()["details"]["attribution"] == props
            users = await client.get("/api/v1/admin/analytics/users?days=7")
            record = next(row for row in users.json()["items"] if row["user_id"] == str(user))
            assert record["signup_source"] == "devpost"
            current = old_user
            assert (
                await client.post(
                    "/api/v1/telemetry/events",
                    json={"events": [event("acquisition.first_touch", properties=props)]},
                )
            ).status_code == 200
        async with engine.connect() as c:
            assert (
                await c.scalar(
                    text(
                        "SELECT properties FROM telemetry_private.user_acquisition WHERE user_id=:id"
                    ),
                    {"id": user},
                )
                == props
            )
            assert (
                await c.scalar(
                    text(
                        "SELECT count(*) FROM telemetry_private.product_events WHERE event_id=:id"
                    ),
                    {"id": batch["events"][0]["event_id"]},
                )
                == 1
            )
            assert (
                await c.scalar(
                    text(
                        "SELECT count(*) FROM telemetry_private.user_acquisition WHERE user_id=:id"
                    ),
                    {"id": old_user},
                )
                == 0
            )
    finally:
        await engine.dispose()


async def test_round_trip_and_official_semantics(telemetry_db):
    engine = create_async_engine(telemetry_db)
    user, problem = uuid4(), uuid4()
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co", app_env="test", database_url=None
        )
    )
    app.state.telemetry_session_factory = SimpleNamespace(
        create_session=lambda: AsyncSession(engine)
    )
    app.state.telemetry_environment = "test"
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user, user, frozenset({"admin"})
    )
    try:
        async with engine.begin() as c:
            await c.execute(text("INSERT INTO profiles(id) VALUES(:id)"), {"id": user})
            version, topic = uuid4(), uuid4()
            await c.execute(
                text("INSERT INTO content_items VALUES(:id,'medium','fixture-problem',:version)"),
                {"id": problem, "version": version},
            )
            await c.execute(
                text("INSERT INTO content_versions VALUES(:id,'Fixture problem')"), {"id": version}
            )
            await c.execute(text("INSERT INTO topics VALUES(:id,'Arrays')"), {"id": topic})
            await c.execute(
                text("INSERT INTO content_version_topics VALUES(:problem,:version,:topic)"),
                {"problem": problem, "version": version, "topic": topic},
            )
            # Local/server Run, failed Submit and provisional pass never become official solves.
            for mode, verdict, plan, status in [
                ("run", "accepted", {"certificateId": "fixture"}, "completed"),
                ("submit", "wrong_answer", {"certificateId": "fixture"}, "completed"),
                ("submit", "provisional_pass", {"gradingLevel": "provisional"}, "completed"),
                ("submit", "accepted", {"certificateId": "fixture"}, "running"),
                ("submit", "accepted", {"certificateId": "fixture"}, "completed"),
                ("submit", "accepted", {"certificateId": "fixture"}, "completed"),
            ]:
                await c.execute(
                    text(
                        "INSERT INTO dsa_execution_private.jobs(id,user_id,request,status,result,plan) VALUES(:id,:user,CAST(:request AS jsonb),:status,CAST(:result AS jsonb),CAST(:plan AS jsonb))"
                    ),
                    {
                        "id": uuid4(),
                        "user": user,
                        "request": json.dumps(
                            {
                                "mode": mode,
                                "problemId": str(problem),
                                "code": "PRIVATE-SOURCE-CANARY",
                            }
                        ),
                        "status": status,
                        "result": json.dumps({"verdict": verdict}),
                        "plan": json.dumps(plan),
                    },
                )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            batch = {
                "events": [
                    event(entity_id=str(problem)),
                    event(
                        "dsa.local_run_started",
                        properties={"purpose": "run", "test_source": "verified"},
                    ),
                ]
            }
            response = await client.post("/api/v1/telemetry/events", json=batch)
            assert response.status_code == 200, response.text
            assert response.json()["accepted"] == 2
            duplicate = await client.post("/api/v1/telemetry/events", json=batch)
            assert duplicate.json()["duplicates"] == 2
            overview = await client.get(f"/api/v1/admin/users/{user}/features?days=7")
            assert overview.status_code == 200, overview.text
            metrics = overview.json()["metrics"]
            assert metrics["official_solves"]["value"] == 1
            assert metrics["official_accepted"]["value"] == 2
            assert metrics["server_submits"]["value"] == 5
            assert metrics["server_runs"]["value"] == 1
            assert metrics["local_runs"]["value"] == 1
            assert metrics["official_acceptance_rate"]["value"] == pytest.approx(2 / 3)
            assert metrics["billed_cost"]["value"] is None
            assert overview.json()["details"]["dsa"]["difficulty_breakdown"] == [
                {"difficulty": "medium", "attempted": 1, "officially_solved": 1}
            ]
            assert overview.json()["details"]["dsa"]["topic_breakdown"] == [
                {"topic": "Arrays", "attempted": 1, "officially_solved": 1}
            ]
            timeline = await client.get(f"/api/v1/admin/users/{user}/telemetry?days=7&limit=3")
            assert timeline.status_code == 200, timeline.text
            body = timeline.json()
            assert len(body["items"]) == 3 and body["next_cursor"]
            older = await client.get(
                f"/api/v1/admin/users/{user}/telemetry",
                params={"days": 7, "limit": 3, "cursor": body["next_cursor"]},
            )
            assert older.status_code == 200, older.text
            assert not ({i["id"] for i in body["items"]} & {i["id"] for i in older.json()["items"]})
            assert "PRIVATE-SOURCE-CANARY" not in timeline.text + overview.text + older.text
            for path in ["users", "health", "funnels", "cohorts"]:
                result = await client.get(f"/api/v1/admin/analytics/{path}?days=7")
                assert result.status_code == 200, (path, result.text)
            sessions = await client.get(f"/api/v1/admin/users/{user}/sessions?days=7")
            assert sessions.status_code == 200, sessions.text
        async with engine.connect() as c:
            assert (
                await c.scalar(
                    text("SELECT count(*) FROM telemetry_private.product_events WHERE user_id=:id"),
                    {"id": user},
                )
                == 2
            )
            assert (
                await c.scalar(
                    text("SELECT count(*) FROM admin_audit_logs WHERE admin_user_id=:id"),
                    {"id": user},
                )
                >= 7
            )
    finally:
        await engine.dispose()


async def test_validation_identity_and_clock_security(telemetry_db):
    engine = create_async_engine(telemetry_db)
    user = uuid4()
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co", app_env="test", database_url=None
        )
    )
    app.state.telemetry_session_factory = SimpleNamespace(
        create_session=lambda: AsyncSession(engine)
    )
    app.state.telemetry_environment = "test"
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user, user, frozenset({"user"})
    )
    try:
        async with engine.begin() as c:
            await c.execute(text("INSERT INTO profiles(id) VALUES(:id)"), {"id": user})
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            for bad in [
                event(user_id=str(uuid4())),
                event("dsa.official_accepted"),
                event(properties={"code": "secret"}),
                event(properties={"entry_point": "access_token=secret"}),
                event(schema_version=2),
            ]:
                response = await client.post("/api/v1/telemetry/events", json={"events": [bad]})
                assert response.status_code == 422, response.text
            assert (
                await client.post(
                    "/api/v1/telemetry/events", json={"events": [event() for _ in range(31)]}
                )
            ).status_code == 422
            assert (
                await client.post("/api/v1/telemetry/events", content=b"x" * 65537)
            ).status_code == 413
            assert (await client.get("/api/v1/admin/analytics/overview")).status_code == 403
            future = event(occurred_at=(datetime.now(UTC) + timedelta(days=2)).isoformat())
            assert (
                await client.post("/api/v1/telemetry/events", json={"events": [future]})
            ).status_code == 200
        async with engine.connect() as c:
            row = (
                await c.execute(
                    text(
                        "SELECT user_id,clock_quality,effective_at<=received_at safe FROM telemetry_private.product_events WHERE event_id=:id"
                    ),
                    {"id": future["event_id"]},
                )
            ).one()
            assert row.user_id == user and row.clock_quality == "invalid" and row.safe
    finally:
        await engine.dispose()


def test_server_only_grants_and_cascade(telemetry_db):
    engine = create_engine(telemetry_db)
    for role in ("anon", "authenticated"):
        for table in (
            "product_events",
            "user_sessions",
            "user_acquisition",
            "account_classifications",
            "ingestion_health",
        ):
            with engine.connect() as c:
                c.execute(text(f"SET LOCAL ROLE {role}"))
                with pytest.raises(DBAPIError):
                    c.execute(text(f"SELECT * FROM telemetry_private.{table}"))
    with engine.begin() as c:
        user = uuid4()
        c.execute(text("INSERT INTO profiles(id) VALUES(:id)"), {"id": user})
        c.execute(
            text(
                "INSERT INTO telemetry_private.user_acquisition(user_id,source,properties) VALUES(:id,'web','{}')"
            ),
            {"id": user},
        )
        c.execute(text("DELETE FROM profiles WHERE id=:id"), {"id": user})
        assert (
            c.scalar(
                text("SELECT count(*) FROM telemetry_private.user_acquisition WHERE user_id=:id"),
                {"id": user},
            )
            == 0
        )
    engine.dispose()


async def test_canonical_reads_work_before_telemetry_migration(telemetry_db):
    engine = create_async_engine(telemetry_db)
    try:
        async with AsyncSession(engine) as session:
            # Transaction-local rename simulates deployed schema lag, then rolls back.
            await session.execute(
                text("ALTER SCHEMA telemetry_private RENAME TO telemetry_not_installed")
            )
            repository = IntelligenceRepository(session)
            result = await repository.overview(30, None, False)
            assert result.metrics["server_submits"].status == "measured"
            assert result.metrics["local_runs"].status == "not_tracked"
            assert result.metrics["sessions"].value is None
            users = await repository.users(30, "", "all", False, 25, 0)
            assert all(item["sessions"] is None for item in users["items"])
            await session.rollback()
    finally:
        await engine.dispose()


def test_expired_feed_actions_keep_metadata_but_user_deletion_removes_it(telemetry_db):
    engine = create_engine(telemetry_db)
    user, story, action = uuid4(), uuid4(), uuid4()
    with engine.begin() as c:
        c.execute(text("CREATE TABLE IF NOT EXISTS knowledge_stories(id uuid PRIMARY KEY)"))
        c.execute(text("INSERT INTO profiles(id) VALUES(:id)"), {"id": user})
        c.execute(text("INSERT INTO knowledge_stories(id) VALUES(:id)"), {"id": story})
        c.execute(
            text("INSERT INTO user_story_events VALUES(:id,:user,:story,'SAVE',now())"),
            {"id": action, "user": user, "story": story},
        )
        c.execute(text("DELETE FROM knowledge_stories WHERE id=:id"), {"id": story})
        c.execute(text("DELETE FROM user_story_events WHERE id=:id"), {"id": action})
        assert (
            c.scalar(
                text("SELECT count(*) FROM telemetry_private.deleted_story_actions WHERE id=:id"),
                {"id": action},
            )
            == 1
        )
        c.execute(text("DELETE FROM profiles WHERE id=:id"), {"id": user})
        assert (
            c.scalar(
                text("SELECT count(*) FROM telemetry_private.deleted_story_actions WHERE id=:id"),
                {"id": action},
            )
            == 0
        )
    engine.dispose()


def test_reconciliation_dry_run_does_not_mutate(telemetry_db):
    engine = create_engine(telemetry_db)
    with engine.connect() as c:
        before = c.scalar(text("SELECT count(*) FROM telemetry_private.product_events"))
    env = dict(os.environ, TELEMETRY_DATABASE_URL=telemetry_db)
    result = subprocess.run(
        [sys.executable, "scripts/telemetry_lifecycle.py"],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    report = json.loads(result.stdout)
    assert report["mode"] == "dry_run"
    assert all(row.get("deleted", 0) == 0 for row in report["retention"].values())
    with engine.connect() as c:
        assert c.scalar(text("SELECT count(*) FROM telemetry_private.product_events")) == before
    engine.dispose()


def test_ai_measurements_rpc_is_server_only_owner_checked_and_idempotent(telemetry_db):
    engine = create_engine(telemetry_db)
    user, conversation, run = uuid4(), uuid4(), uuid4()
    with engine.begin() as c:
        c.execute(text("INSERT INTO profiles(id) VALUES(:id)"), {"id": user})
        c.execute(
            text("INSERT INTO reasonai_conversations VALUES(:id,:user,'dsa')"),
            {"id": conversation, "user": user},
        )
        c.execute(
            text(
                "INSERT INTO reasonai_runs VALUES(:id,:conversation,now(),'completed',NULL,now())"
            ),
            {"id": run, "conversation": conversation},
        )
    command = text("SELECT public.telemetry_record_ai_run(:run,:user,'completed',100,20,'{}','[]')")
    for role in ("anon", "authenticated"):
        with engine.connect() as c:
            c.execute(text(f"SET LOCAL ROLE {role}"))
            with pytest.raises(DBAPIError):
                c.execute(command, {"run": run, "user": user})
    with engine.begin() as c:
        c.execute(text("SET LOCAL ROLE service_role"))
        c.execute(command, {"run": run, "user": user})
        c.execute(command, {"run": run, "user": user})
        assert (
            c.scalar(
                text(
                    "SELECT count(*) FROM telemetry_private.ai_run_measurements WHERE run_id=:run"
                ),
                {"run": run},
            )
            == 1
        )
    with engine.connect() as c:
        c.execute(text("SET LOCAL ROLE service_role"))
        with pytest.raises(DBAPIError):
            c.execute(command, {"run": run, "user": uuid4()})
    engine.dispose()


async def test_mature_cohorts_require_an_observed_signup_session(telemetry_db):
    engine = create_async_engine(telemetry_db)
    user = uuid4()
    try:
        async with AsyncSession(engine) as session:
            await session.execute(
                text(
                    "UPDATE telemetry_private.installation SET collection_started_at=now()-interval '3 days'"
                )
            )
            await session.execute(
                text("INSERT INTO profiles(id,created_at) VALUES(:user,now()-interval '2 days')"),
                {"user": user},
            )
            for name, age, engaged in [
                ("session.started", 2, False),
                ("dsa.editing_started", 1, True),
            ]:
                await session.execute(
                    text("""
                  INSERT INTO telemetry_private.product_events(event_id,schema_version,user_id,session_id,event_name,feature,source,environment,occurred_at,received_at,effective_at,clock_quality,engaged,properties)
                  VALUES(:id,1,:user,:session,:name,'dsa','web','test',now()-:age*interval '1 day',now()-:age*interval '1 day',now()-:age*interval '1 day','plausible',:engaged,'{}')
                """),
                    {
                        "id": uuid4(),
                        "user": user,
                        "session": uuid4(),
                        "name": name,
                        "age": age,
                        "engaged": engaged,
                    },
                )
            result = await IntelligenceRepository(session).cohorts(7)
            assert any(r["day"] == 1 and r["retained"] >= 1 for r in result["items"])
            assert not any(r["day"] == 7 for r in result["items"])
            await session.rollback()
    finally:
        await engine.dispose()


async def test_authoritative_worker_lifecycle_does_not_double_count_outcomes(telemetry_db):
    engine = create_async_engine(telemetry_db)
    user, job, problem = uuid4(), uuid4(), uuid4()
    try:
        async with AsyncSession(engine) as session:
            await session.execute(text("INSERT INTO profiles(id) VALUES(:user)"), {"user": user})
            await session.execute(
                text("""
              INSERT INTO dsa_execution_private.jobs(id,user_id,request,status,result,plan)
              VALUES(:job,:user,CAST(:request AS jsonb),'queued',NULL,'{"certificateId":"fixture","gradingLevel":"official"}')
            """),
                {
                    "job": job,
                    "user": user,
                    "request": json.dumps({"mode": "submit", "problemId": str(problem)}),
                },
            )
            for phase, status, result in [
                ("launching", "running", None),
                ("launched", "running", None),
                ("launched", "completed", '{"verdict":"accepted"}'),
            ]:
                await session.execute(
                    text(
                        "UPDATE dsa_execution_private.jobs SET phase=:phase,status=:status,result=CAST(:result AS jsonb) WHERE id=:job"
                    ),
                    {"job": job, "phase": phase, "status": status, "result": result},
                )
            await session.execute(
                text("UPDATE dsa_execution_private.jobs SET status=status WHERE id=:job"),
                {"job": job},
            )
            assert (
                await session.scalar(
                    text(
                        "SELECT count(*) FROM telemetry_private.dsa_job_transitions WHERE job_id=:job"
                    ),
                    {"job": job},
                )
                == 4
            )
            result = await IntelligenceRepository(session).overview(7, user, False)
            assert result.metrics["server_submits"].value == 1
            assert result.metrics["official_accepted"].value == 1
            assert result.metrics["official_solves"].value == 1
            timeline = await IntelligenceRepository(session).timeline(user, 7, 30, None)
            names = {e.name for e in timeline.items}
            assert {
                "dsa.submit_queued",
                "dsa.dispatch_started",
                "dsa.sandbox_started",
                "dsa.official_accepted",
            } <= names
            await session.rollback()
    finally:
        await engine.dispose()


async def test_entire_client_registry_is_ingested_and_retrievable(telemetry_db):
    engine = create_async_engine(telemetry_db)
    user = uuid4()
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co", app_env="test", database_url=None
        )
    )
    app.state.telemetry_session_factory = SimpleNamespace(
        create_session=lambda: AsyncSession(engine)
    )
    app.state.telemetry_environment = "test"
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user, user, frozenset({"admin"})
    )
    try:
        async with engine.begin() as c:
            await c.execute(text("INSERT INTO profiles(id) VALUES(:user)"), {"user": user})
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            events = [event(name) for name in REGISTRY["events"]]
            for i in range(0, len(events), 30):
                response = await client.post(
                    "/api/v1/telemetry/events", json={"events": events[i : i + 30]}
                )
                assert response.status_code == 200, response.text
            timeline = await client.get(f"/api/v1/admin/users/{user}/telemetry?days=7&limit=100")
            assert timeline.status_code == 200, timeline.text
            assert set(REGISTRY["events"]) <= {row["name"] for row in timeline.json()["items"]}
    finally:
        await engine.dispose()


async def test_observed_journey_analytics_reconcile_without_inventing_lifetime_history(
    telemetry_db,
):
    engine = create_async_engine(telemetry_db)
    user = uuid4()
    try:
        async with AsyncSession(engine) as session:
            joined = datetime.now(UTC) - timedelta(minutes=2)
            await session.execute(
                text("INSERT INTO profiles(id,created_at) VALUES(:user,:joined)"),
                {"user": user, "joined": joined},
            )
            for age in (60, 30):
                session_id = str(uuid4())
                payload = []
                for index, (name, properties) in enumerate(
                    [
                        ("navigation.feature_entered", {"feature": "dsa"}),
                        ("navigation.feature_entered", {"feature": "feed"}),
                        ("dsa.editing_started", {}),
                    ]
                ):
                    payload.append(
                        event(
                            name,
                            session_id=session_id,
                            properties=properties,
                            occurred_at=(joined + timedelta(seconds=age + index)).isoformat(),
                        )
                    )
                await ingest(session, Batch.model_validate({"events": payload}), user, "test")
            result = await IntelligenceRepository(session).funnels(7, user)
            assert result["first_action"][0]["observed_new_users"] == 1
            assert result["first_action"][0]["first_meaningful_seconds"] == pytest.approx(32)
            transition = next(
                row for row in result["feature_journeys"] if row["kind"] == "transition"
            )
            assert (
                transition["from_feature"],
                transition["to_feature"],
                transition["observations"],
            ) == ("dsa", "feed", 2)
            revisits = [row for row in result["feature_journeys"] if row["kind"] == "revisit"]
            assert len(revisits) == 2 and all(row["revisit_rate"] == 1 for row in revisits)
            assert result["engagement"] == [
                {
                    "segment": "returning",
                    "engaged_users": 1,
                    "engaged_sessions": 2,
                    "sessions_per_engaged_user": 2.0,
                }
            ]
            assert result["official_conversion"][0]["submitted"] == 0
            assert result["official_conversion"][0]["acceptance_rate"] is None
            journey, problem, other_problem = str(uuid4()), str(uuid4()), str(uuid4())
            payload = [
                event("dsa.local_run_started", journey_id=journey, entity_id=problem),
                event("dsa.submit_initiated", journey_id=journey, entity_id=other_problem),
            ]
            await ingest(session, Batch.model_validate({"events": payload}), user, "test")
            unrelated = await IntelligenceRepository(session).funnels(7, user)
            assert unrelated["items"] == [
                {"step": "dsa.local_run_started", "journeys": 1, "converted": 0}
            ]
            await ingest(
                session,
                Batch.model_validate(
                    {
                        "events": [
                            event("dsa.submit_initiated", journey_id=journey, entity_id=problem),
                        ]
                    }
                ),
                user,
                "test",
            )
            related = await IntelligenceRepository(session).funnels(7, user)
            assert related["items"] == [
                {"step": "dsa.local_run_started", "journeys": 1, "converted": 1}
            ]
            await session.rollback()
    finally:
        await engine.dispose()
