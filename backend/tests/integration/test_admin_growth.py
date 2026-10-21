"""Real PostgreSQL coverage of cross-surface metrics, using an isolated local database."""

# Local test DDL uses only literal allowlists and randomized local database identifiers.
# ruff: noqa: E501, S608
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from recallstack.modules.admin.infrastructure.growth_repository import load_platform_growth
from recallstack.modules.admin.presentation.analytics_schemas import GrowthResponse

pytestmark = pytest.mark.integration
NOW = datetime(2026, 10, 21, 12, tzinfo=UTC)


@pytest.fixture(scope="module")
def growth_database(postgres_url):
    url = make_url(postgres_url.replace("postgresql+psycopg2://", "postgresql+psycopg://"))
    assert url.host in {"localhost", "127.0.0.1", "::1"}, "Never seed a remote database"
    name = f"admin_growth_{uuid4().hex}"
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    local = url.set(database=name).render_as_string(hide_password=False)
    engine = create_engine(local)
    with engine.begin() as c:
        c.execute(
            text("""
          CREATE TABLE profiles(id uuid PRIMARY KEY,created_at timestamptz);
          CREATE TABLE content_items(id uuid PRIMARY KEY,type text);
          CREATE TABLE activity_events(user_id uuid,content_item_id uuid,event_type text,occurred_at timestamptz);
          CREATE TABLE practice_attempts(user_id uuid,attempted_at timestamptz);
          CREATE TABLE review_history(user_id uuid,reviewed_at timestamptz);
          CREATE TABLE reasonai_conversations(id uuid PRIMARY KEY,user_id uuid,surface text,created_at timestamptz);
          CREATE TABLE reasonai_runs(id uuid PRIMARY KEY,conversation_id uuid,started_at timestamptz,status text,error_code text);
          CREATE TABLE user_story_events(id uuid PRIMARY KEY,profile_id uuid,event_type text,occurred_at timestamptz);
          CREATE TABLE dsa_practice_submissions(user_id uuid,created_at timestamptz);
          CREATE SCHEMA dsa_execution_private;
          CREATE TABLE dsa_execution_private.jobs(id uuid PRIMARY KEY,user_id uuid,created_at timestamptz,request jsonb,status text,result jsonb,plan jsonb);
          CREATE SCHEMA dsa_reports_private;
          CREATE TABLE dsa_reports_private.reports(id uuid PRIMARY KEY,created_at timestamptz,status text);
        """)
        )
    yield local
    engine.dispose()
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
    admin.dispose()


async def read_growth(url, days):
    engine = create_async_engine(url)
    try:
        async with AsyncSession(engine) as session:
            # A 90-day window crosses NZ daylight saving. Reporting stays in UTC.
            await session.execute(text("SET LOCAL TIME ZONE 'Pacific/Auckland'"))
            with patch(
                "recallstack.modules.admin.infrastructure.growth_repository.datetime"
            ) as clock:
                clock.now.return_value = NOW
                clock.combine.side_effect = datetime.combine
                return GrowthResponse.model_validate(await load_platform_growth(session, days))
    finally:
        await engine.dispose()


@pytest.mark.parametrize("days", (7, 30, 90))
async def test_empty_growth_has_exact_utc_days_and_finite_zero_rates(growth_database, days):
    result = await read_growth(growth_database, days)
    assert result.total_users == result.new_users == result.tracked_engaged_users == 0
    assert result.activation_rate == 0
    assert len(result.daily_signups) == days
    assert result.daily_signups[0].day == (NOW - timedelta(days=days - 1)).date()
    assert result.daily_signups[-1].day == NOW.date()
    assert sum(p.signups for p in result.daily_signups) == 0


async def test_growth_boundaries_deduplication_and_measured_engagement(growth_database):
    engine = create_engine(growth_database)
    old, viewer, engaged, empty_conversation, future = [uuid4() for _ in range(5)]
    boundary = NOW.replace(hour=0) - timedelta(days=6)
    problem = uuid4()
    conversation = uuid4()
    try:
        with engine.begin() as c:
            for user, at in [
                (old, boundary - timedelta(microseconds=1)),
                (viewer, boundary),
                (engaged, NOW),
                (empty_conversation, NOW),
                (future, NOW + timedelta(microseconds=1)),
            ]:
                c.execute(text("INSERT INTO profiles VALUES (:id,:at)"), {"id": user, "at": at})
            c.execute(text("INSERT INTO content_items VALUES (:id,'problem')"), {"id": problem})
            for at in [
                boundary - timedelta(microseconds=1),
                boundary,
                NOW,
                NOW + timedelta(microseconds=1),
            ]:
                c.execute(
                    text("INSERT INTO user_story_events VALUES (:id,:user,'VIEW',:at)"),
                    {"id": uuid4(), "user": viewer, "at": at},
                )
            for user, event in [
                (old, "content_opened"),
                (engaged, "admin_practice_resources_replaced"),
            ]:
                c.execute(
                    text("INSERT INTO activity_events VALUES (:user,:problem,:event,:at)"),
                    {"user": user, "problem": problem, "event": event, "at": boundary},
                )
            c.execute(
                text("INSERT INTO reasonai_conversations VALUES (:id,:user,'system_design',:at)"),
                {"id": conversation, "user": empty_conversation, "at": NOW},
            )
            # Multiple executions on the same day are one active/engaged user/day.
            for mode, verdict, plan in [
                ("run", "accepted", "{}"),
                ("submit", "accepted", '{"certificateId":"test","gradingLevel":"official"}'),
                ("submit", "provisional_pass", '{"gradingLevel":"provisional"}'),
                ("submit", "accepted", '{"gradingLevel":"provisional"}'),
            ]:
                c.execute(
                    text(
                        "INSERT INTO dsa_execution_private.jobs VALUES (:id,:user,:at,jsonb_build_object('mode',CAST(:mode AS text)),'completed',jsonb_build_object('verdict',CAST(:verdict AS text)),CAST(:plan AS jsonb))"
                    ),
                    {
                        "id": uuid4(),
                        "user": engaged,
                        "at": NOW,
                        "mode": mode,
                        "verdict": verdict,
                        "plan": plan,
                    },
                )
        result = await read_growth(growth_database, 7)
        assert result.total_users == 4 and result.new_users == 3
        assert result.recorded_active_users == 3
        assert result.returning_users == 1 and result.repeat_active_users == 1
        assert result.tracked_engaged_users == result.newly_engaged_users == 1
        assert result.activation_rate == 1 / 3
        assert result.knowledge_events == result.knowledge_impressions == 2
        assert result.server_runs == 1 and result.server_submissions == 3
        assert result.official_accepted == result.provisional_passes == 1
        assert result.dsa_submissions == 0
        assert sum(p.signups for p in result.daily_signups) == result.new_users
        assert (
            dict((p.feature, p.unique_users) for p in result.feature_usage)["ai_system_design"] == 0
        )
    finally:
        with engine.begin() as c:
            c.execute(
                text(
                    "TRUNCATE profiles,content_items,activity_events,reasonai_conversations,user_story_events,dsa_execution_private.jobs"
                )
            )
        engine.dispose()


def test_admin_access_migration_preserves_data_and_denies_browser_roles(growth_database):
    engine = create_engine(growth_database)
    with engine.begin() as c:
        c.execute(
            text("""
          DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
          END $$;
          CREATE TABLE roles(id bigserial PRIMARY KEY,code text);
          CREATE TABLE profile_role_grants(id bigserial PRIMARY KEY,role_id bigint);
          CREATE TABLE admin_audit_logs(id bigserial PRIMARY KEY,action text);
          INSERT INTO roles(code) VALUES ('admin');
          INSERT INTO profile_role_grants(role_id) VALUES (1);
          INSERT INTO admin_audit_logs(action) VALUES ('test');
          GRANT ALL ON roles,profile_role_grants,admin_audit_logs TO anon,authenticated;
          GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
        """)
        )
    migration = (
        Path(__file__).resolve().parents[3]
        / "web/supabase/migrations/20261021061454_admin_role_and_audit_access.sql"
    )
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
        c.execute(text(migration.read_text()))
    for role in ("anon", "authenticated"):
        for table in ("roles", "profile_role_grants", "admin_audit_logs"):
            for sql in (f"SELECT * FROM {table}", f"DELETE FROM {table}"):
                with engine.connect() as c:
                    c.execute(text(f"SET LOCAL ROLE {role}"))
                    with pytest.raises(DBAPIError):
                        c.execute(text(sql))
    with engine.begin() as c:
        for table in ("roles", "profile_role_grants", "admin_audit_logs"):
            assert c.scalar(text(f"SELECT count(*) FROM {table}")) == 1
        c.execute(text("SET LOCAL ROLE service_role"))
        c.execute(text("INSERT INTO admin_audit_logs(action) VALUES ('server remains authorized')"))
    engine.dispose()
