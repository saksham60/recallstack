"""Proposed report migration, tested only against disposable loopback Postgres."""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from tests.dsa.test_execution_storage import command, create

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def report_schema(execution_schema):
    migration = Path(__file__).resolve().parents[3] / (
        "web/supabase/migrations/20261017060229_dsa_v3_report_orchestration.sql"
    )
    with execution_schema.begin() as connection:
        installed = migration.with_name(
            "20261016073423_dsa_certification_ledger_and_code_intelligence.sql"
        ).read_text(encoding="utf-8")
        # Exact installed public report tables, policies and deterministic job snapshot.
        # Certificate-gate tests are separate from this report lifecycle fixture.
        connection.connection.driver_connection.execute(
            installed[
                installed.index(
                    "create table public.dsa_code_intelligence_reports"
                ) : installed.index("-- Seed review registry")
            ]
        )
        legacy = migration.with_name("20261016074500_dsa_code_intelligence_reconcile_and_claim.sql")
        connection.connection.driver_connection.execute(legacy.read_text(encoding="utf-8"))
        connection.connection.driver_connection.execute(migration.read_text(encoding="utf-8"))
        no_ceiling = migration.with_name(
            "20261017083528_dsa_remove_report_attempt_ceiling.sql"
        )
        connection.connection.driver_connection.execute(no_ceiling.read_text(encoding="utf-8"))
    return execution_schema


@pytest.fixture
def report_data(report_schema, execution_data):
    yield execution_data
    with report_schema.begin() as connection:
        connection.exec_driver_sql("delete from public.dsa_code_intelligence_reports")


def report_command(data, action, **args):
    with data["engine"].begin() as connection:
        connection.exec_driver_sql("set local role service_role")
        return connection.scalar(
            text("select public.dsa_report_command(:action,cast(:args as jsonb))"),
            {"action": action, "args": json.dumps(args, default=str)},
        )


def complete(data, verdict="accepted", code_suffix=""):
    job = create(data, mode="submit")
    if code_suffix:
        with data["engine"].begin() as connection:
            connection.execute(
                text(
                    "update dsa_execution_private.jobs set request=jsonb_set(request,'{code}',"
                    "to_jsonb((request->>'code')||:suffix)) where id=:id"
                ),
                {"suffix": code_suffix, "id": job["submissionId"]},
            )
    token = uuid4()
    command(data, "claim", id=job["submissionId"], token=token)
    command(
        data,
        "finish",
        id=job["submissionId"],
        token=token,
        status="completed",
        result={"verdict": verdict, "executionTimeMs": 7},
        release=True,
    )
    return job["submissionId"]


def dispatch(data):
    return report_command(data, "dispatch", model="test/model", rubric="dsa-code-intelligence:1")


def test_durable_deduplication_owner_projection_and_verdict_immutability(report_data):
    data = report_data
    first, second = complete(data), complete(data)
    with data["engine"].begin() as connection:
        installed_report = connection.scalar(
            text(
                "insert into public.dsa_code_intelligence_reports(submission_id) "
                "values(:id) returning id"
            ),
            {"id": first},
        )
    due = dispatch(data)
    assert len(due) == 1
    assert due[0]["id"] == str(installed_report)
    a = report_command(data, "get", submissionId=first, userId=data["owner"])
    b = report_command(data, "get", submissionId=second, userId=data["owner"])
    assert a["report"]["id"] == b["report"]["id"]
    assert report_command(data, "get", submissionId=first, userId=data["other"]) is None
    assert report_command(
        data,
        "history",
        userId=data["other"],
        problemId=data["row"]["id"],
        problemVersionId=data["row"]["version"],
    ) == {"items": []}
    token = uuid4()
    claim = report_command(data, "claim", id=due[0]["id"], token=token)
    packet = claim["packet"]
    assert packet["judge"] == {
        "verdict": "accepted",
        "gradingLevel": "official",
        "executionTimeMs": 7,
    }
    assert not {"plan", "cases", "expected", "oracle", "stdout", "stderr"} & packet.keys()
    assert "SECRET" not in json.dumps(packet)
    assert report_command(data, "claim", id=due[0]["id"], token=uuid4()) is None
    assert not report_command(
        data, "finish", id=due[0]["id"], token=uuid4(), document={"summary": "bad fence"}
    )
    assert report_command(
        data, "finish", id=due[0]["id"], token=token, document={"summary": "AI estimate"}
    )
    assert report_command(data, "claim", id=due[0]["id"], token=uuid4()) == "done"
    with data["engine"].begin() as connection:
        canonical = connection.execute(
            text(
                "select generation_status,assessment from public.dsa_code_intelligence_reports "
                "where id=:id"
            ),
            {"id": installed_report},
        ).one()
        assert canonical.generation_status == "completed"
        assert canonical.assessment == {"summary": "AI estimate"}
    assert command(data, "get", id=first, userId=data["owner"])["result"]["verdict"] == "accepted"
    assert dispatch(data) == []


def test_report_schema_is_private_and_infrastructure_failures_do_not_schedule(report_data):
    data = report_data
    job = create(data, mode="submit")
    token = uuid4()
    command(data, "claim", id=job["submissionId"], token=token)
    command(data, "finish", id=job["submissionId"], token=token, status="failed", release=True)
    assert dispatch(data) == []
    with pytest.raises(DBAPIError), data["engine"].begin() as connection:
        connection.exec_driver_sql("set local role authenticated")
        connection.exec_driver_sql("select * from dsa_reports_private.reports")
    with pytest.raises(DBAPIError), data["engine"].begin() as connection:
        connection.exec_driver_sql("set local role anon")
        connection.exec_driver_sql("select public.dsa_report_command('dispatch','{}')")


def test_retries_beyond_two_expiry_fences_and_versioned_dedup(report_data):
    data = report_data
    first = complete(data, "wrong_answer")
    due = dispatch(data)
    report_id = due[0]["id"]
    first_token = uuid4()
    assert report_command(data, "claim", id=report_id, token=first_token)["attempt"] == 1
    assert report_command(
        data, "finish", id=report_id, token=first_token, error="retry", retry=True
    )
    assert report_command(data, "claim", id=report_id, token=uuid4()) is None
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                "update dsa_reports_private.reports set next_dispatch_at=now(),"
                "available_at=now() where id=:id"
            ),
            {"id": report_id},
        )
    second_token = uuid4()
    assert report_command(data, "claim", id=report_id, token=second_token)["attempt"] == 2
    assert not report_command(
        data, "finish", id=report_id, token=first_token, document={"summary": "stale"}
    )
    assert report_command(
        data, "finish", id=report_id, token=second_token, error="last", retry=True
    )
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                "update dsa_reports_private.reports set next_dispatch_at=now(),"
                "available_at=now() where id=:id"
            ),
            {"id": report_id},
        )
    third_token = uuid4()
    assert report_command(data, "claim", id=report_id, token=third_token)["attempt"] == 3
    assert report_command(
        data, "finish", id=report_id, token=third_token, error="permanent", retry=False
    )
    assert report_command(data, "claim", id=report_id, token=uuid4()) == "done"
    result = report_command(data, "get", submissionId=first, userId=data["owner"])
    assert result["report"]["status"] == "failed"
    assert result["report"]["attempts"] == 3
    # Identical code with another actual verdict has an independent report.
    complete(data, "accepted")
    assert len(dispatch(data)) == 1


def test_daily_report_quota_global_concurrency_and_expired_worker_recovery(report_data):
    data = report_data
    jobs = [complete(data, code_suffix=f"\n# attempt {index}") for index in range(11)]
    due = dispatch(data)
    assert len(due) == 10
    views = [report_command(data, "get", submissionId=job, userId=data["owner"]) for job in jobs]
    assert sum(view["report"]["status"] == "rate_limited" for view in views) == 1
    tokens = [uuid4() for _ in range(3)]
    assert report_command(data, "claim", id=due[0]["id"], token=tokens[0])
    assert report_command(data, "claim", id=due[1]["id"], token=tokens[1])
    assert report_command(data, "claim", id=due[2]["id"], token=tokens[2]) is None
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                "update dsa_reports_private.reports set worker_until=now()-interval '1 second' "
                "where id=:id"
            ),
            {"id": due[0]["id"]},
        )
    next_token = uuid4()
    recovered = report_command(data, "claim", id=due[0]["id"], token=next_token)
    assert recovered["attempt"] == 2
    assert not report_command(
        data, "finish", id=due[0]["id"], token=tokens[0], document={"summary": "expired"}
    )


def test_history_keyset_pagination_is_bounded_and_exact_version_scoped(report_data):
    data = report_data
    for _ in range(22):
        complete(data)
    args = {
        "userId": data["owner"],
        "problemId": data["row"]["id"],
        "problemVersionId": data["row"]["version"],
    }
    first = report_command(data, "history", **args)["items"]
    assert len(first) == 21
    next_page = report_command(
        data, "history", **args, before=first[19]["createdAt"], beforeId=first[19]["submissionId"]
    )["items"]
    assert len(next_page) == 2
    assert not {row["submissionId"] for row in first[:20]} & {
        row["submissionId"] for row in next_page
    }
    assert all("plan" not in row and "code" not in row for row in first)
    assert report_command(data, "history", **{**args, "problemVersionId": uuid4()}) == {"items": []}


def test_legacy_attempt_limit_parameter_no_longer_caps_retries(report_data):
    data = report_data
    complete(data)
    due = report_command(
        data, "dispatch", model="test/model", rubric="dsa-code-intelligence:1", maxAttempts=1
    )
    token = uuid4()
    assert report_command(data, "claim", id=due[0]["id"], token=token)["attempt"] == 1
    assert report_command(
        data, "finish", id=due[0]["id"], token=token, error="provider unavailable", retry=True
    )
    with data["engine"].begin() as connection:
        connection.execute(
            text("update dsa_reports_private.reports set available_at=now() where id=:id"),
            {"id": due[0]["id"]},
        )
    assert report_command(data, "claim", id=due[0]["id"], token=uuid4())["attempt"] == 2


def test_live_scope_does_not_drain_backlog_or_claim_unscoped_delivery(report_data):
    data = report_data
    old = complete(data, code_suffix="\n# historical backlog")
    pilot = complete(data, code_suffix="\n# limited pilot")
    args = {"model": "test/model", "rubric": "dsa-code-intelligence:1"}
    assert report_command(data, "dispatch", **args, submissionIds=[]) == {
        "code": "INVALID_CONFIGURATION"
    }
    due = report_command(data, "dispatch", **args, submissionIds=[pilot])
    assert len(due) == 1
    assert report_command(data, "get", submissionId=old, userId=data["owner"])["report"] is None
    assert (
        report_command(data, "claim", id=due[0]["id"], token=uuid4(), submissionIds=[old]) == "done"
    )
    claim = report_command(data, "claim", id=due[0]["id"], token=uuid4(), submissionIds=[pilot])
    assert claim["packet"]["submissionId"] == str(pilot)
    assert report_command(data, "dispatch", **args, submissionIds=[pilot]) == []
    assert len(dispatch(data)) == 1
