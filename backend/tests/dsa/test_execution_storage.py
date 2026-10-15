"""Exercise the web execution migration only in dsa_engine's disposable database."""

import json
import os
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import insert, text
from sqlalchemy.exc import DBAPIError

from recallstack.modules.dsa.infrastructure.sqlalchemy_models import TestCaseModel as Case

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def execution_schema(dsa_engine):
    migration = (
        Path(__file__).resolve().parents[3]
        / "web/supabase/migrations/20261015172042_dsa_execution_jobs.sql"
    )
    assert dsa_engine.url.host in {"localhost", "127.0.0.1", "::1"}
    assert dsa_engine.url.database.startswith("dsa_api_test_")
    with dsa_engine.begin() as connection:
        connection.exec_driver_sql("""
        do $$ begin
          if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
          if not exists(select 1 from pg_roles where rolname='authenticated') then
            create role authenticated;
          end if;
          if not exists(select 1 from pg_roles where rolname='service_role') then
            create role service_role bypassrls;
          end if;
        end $$;
        """)
        connection.connection.driver_connection.execute(migration.read_text(encoding="utf-8"))
    return dsa_engine


@pytest.fixture
def execution_data(execution_schema, dataset):
    engine, row = execution_schema, dataset["rows"]["a"]
    with engine.begin() as connection:
        for ordinal, visibility in enumerate(("public", "hidden")):
            connection.execute(
                insert(Case).values(
                    suite_id=row["suite"],
                    ordinal=ordinal,
                    category="official",
                    visibility=visibility,
                    validation_status="verified",
                    input_json={"nums": [ordinal + 1]},
                    expected_json=ordinal + 1,
                )
            )
        connection.execute(
            text("""insert into dsa_execution_private.certificates
          (problem_version_id,suite_id,contract,public_run_approved,hidden_submit_approved,certified_by,certified_at)
          values (:version,:suite,cast(:contract as jsonb),true,true,:owner,now())"""),
            {
                "version": row["version"],
                "suite": row["suite"],
                "owner": dataset["owner"],
                "contract": json.dumps(
                    {"entrypoint": "solve", "inputMode": "kwargs", "checker": "exact_json"}
                ),
            },
        )
    yield {**dataset, "row": row}
    with engine.begin() as connection:
        # This database exists exclusively for these tests; no production URLs accepted.
        connection.execute(text("delete from dsa_execution_private.jobs"))


def command(data, action, **args):
    with data["engine"].begin() as connection:
        connection.exec_driver_sql("set local role service_role")
        return connection.scalar(
            text("select public.dsa_execution_command(:action, cast(:args as jsonb))"),
            {"action": action, "args": json.dumps(args, default=str)},
        )


def request(data, key=None, mode="run"):
    return {
        "problemId": str(data["row"]["id"]),
        "problemVersionId": str(data["row"]["version"]),
        "language": "python",
        "mode": mode,
        "code": "def solve(nums): return sum(nums)",
        "idempotencyKey": str(key or uuid4()),
    }


def create(data, *, user=None, key=None, mode="run", request_hash="a" * 64):
    return command(
        data,
        "create",
        userId=user or data["owner"],
        request=request(data, key, mode),
        hash=request_hash,
    )


def test_private_roles_and_owned_status(execution_data):
    data = execution_data
    job = create(data)
    for role in ("anon", "authenticated"):
        with pytest.raises(DBAPIError), data["engine"].begin() as connection:
            connection.exec_driver_sql(f"set local role {role}")
            connection.exec_driver_sql("select public.dsa_execution_command('dispatch','{}')")
        with pytest.raises(DBAPIError), data["engine"].begin() as connection:
            connection.exec_driver_sql(f"set local role {role}")
            connection.exec_driver_sql("select * from dsa_execution_private.jobs")
    assert command(data, "get", id=job["submissionId"], userId=data["other"]) is None
    assert command(data, "cancel", id=job["submissionId"], userId=data["other"]) is None
    view = command(data, "get", id=job["submissionId"], userId=data["owner"])
    assert view["status"] == "queued"
    assert not {"plan", "request", "code", "operationId", "slot"} & view.keys()


def test_concurrent_idempotency_and_account_limits(execution_data):
    data, key = execution_data, uuid4()
    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = list(pool.map(lambda _: create(data, key=key), range(8)))
    assert len({job["submissionId"] for job in jobs}) == 1
    assert create(data, key=key, request_hash="b" * 64)["code"] == "IDEMPOTENCY_CONFLICT"
    assert "submissionId" in create(data)
    assert create(data)["code"] == "ACCOUNT_LIMIT"


def test_global_capacity_is_five_and_expired_leases_do_not_release_operations(execution_data):
    data = execution_data
    users = [uuid4() for _ in range(8)]
    with data["engine"].begin() as connection:
        for user in users:
            connection.execute(text("insert into auth.users(id) values(:id)"), {"id": user})
            connection.execute(text("insert into profiles(id) values(:id)"), {"id": user})
    jobs = [create(data, user=user) for user in users]
    tokens = [uuid4() for _ in jobs]
    with ThreadPoolExecutor(max_workers=8) as pool:
        claims = list(
            pool.map(
                lambda pair: command(data, "claim", id=pair[0]["submissionId"], token=pair[1]),
                zip(jobs, tokens, strict=True),
            )
        )
    assert sum(claim is not None for claim in claims) == 5
    first = next(claim for claim in claims if claim)
    assert command(data, "launch", id=first["id"], token=first["token"])
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                "update dsa_execution_private.jobs set worker_until=now()-interval '1 minute' "
                "where id=:id"
            ),
            {"id": first["id"]},
        )
    new_token = uuid4()
    recovered = command(data, "claim", id=first["id"], token=new_token)
    assert recovered["phase"] == "launching"
    assert command(data, "launch", id=first["id"], token=first["token"])["code"] == "LEASE_LOST"
    waiting = next(job for job, claim in zip(jobs, claims, strict=True) if claim is None)
    assert command(data, "claim", id=waiting["submissionId"], token=uuid4()) is None
    with data["engine"].connect() as connection:
        assert (
            connection.scalar(
                text("select count(*) from dsa_execution_private.jobs where slot is not null")
            )
            == 5
        )
    # A confirmed terminal operation frees exactly one slot; a fence expiry never does.
    command(data, "finish", id=first["id"], token=new_token, status="failed", release=True)
    assert command(data, "claim", id=waiting["submissionId"], token=uuid4())


def test_publication_pending_cases_and_latest_suite_gates(execution_data):
    data, row = execution_data, execution_data["row"]
    args = {"problemId": row["id"], "problemVersionId": row["version"]}
    assert len(command(data, "availability", **args)["run"]["cases"]) == 1
    assert len(command(data, "availability", **args)["submit"]["cases"]) == 2
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                "update dsa_test_cases set validation_status='pending' "
                "where suite_id=:id and visibility='hidden'"
            ),
            {"id": row["suite"]},
        )
    available = command(data, "availability", **args)
    assert available["run"] and available["submit"] is None
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                "insert into dsa_test_suites(problem_version_id,suite_version,status) "
                "values(:id,2,'draft')"
            ),
            {"id": row["version"]},
        )
    assert command(data, "availability", **args) == {"run": None, "submit": None}
    for key in ("draft", "unapproved", "string_approval", "other"):
        protected = data["rows"][key]
        assert command(
            data, "availability", problemId=protected["id"], problemVersionId=protected["version"]
        ) == {"run": None, "submit": None}


def test_plan_changes_are_rejected_and_hidden_results_are_scrubbed(execution_data):
    data = execution_data
    job = create(data, mode="submit")
    token = uuid4()
    claimed = command(data, "claim", id=job["submissionId"], token=token)
    assert command(data, "plan", id=claimed["id"], token=token)["cases"]
    command(
        data,
        "finish",
        id=claimed["id"],
        token=token,
        status="completed",
        result={
            "verdict": "accepted",
            "publicCases": [{"input": "PRIVATE_HIDDEN_INPUT"}],
            "stdout": "PRIVATE_LOG",
            "passedTests": 2,
            "totalTests": 2,
        },
    )
    view = command(data, "get", id=claimed["id"], userId=data["owner"])
    assert view["result"] == {"verdict": "accepted"}
    assert "PRIVATE" not in json.dumps(view)
    assert command(data, "claim", id=claimed["id"], token=uuid4()) == "done"
    second = create(data)
    claimed = command(data, "claim", id=second["submissionId"], token=uuid4())
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                "update dsa_test_cases set expected_json='99'::jsonb "
                "where suite_id=:id and visibility='public'"
            ),
            {"id": data["row"]["suite"]},
        )
    assert command(data, "plan", id=claimed["id"], token=claimed["token"])["code"] == "NOT_ELIGIBLE"
    command(
        data,
        "finish",
        id=claimed["id"],
        token=claimed["token"],
        status="completed",
        result={"verdict": "passed_public_tests"},
    )
    assert command(data, "get", id=claimed["id"], userId=data["owner"])["status"] == "failed"


def test_cancel_outbox_and_quarantine_are_durable(execution_data):
    data = execution_data
    queued = create(data)
    cancelled = command(data, "cancel", id=queued["submissionId"], userId=data["owner"])
    assert cancelled["status"] == "cancelled"
    assert command(data, "claim", id=queued["submissionId"], token=uuid4()) == "done"
    job = create(data)
    dispatch = command(data, "dispatch")
    assert dispatch == [{"id": job["submissionId"], "generation": 1}]
    assert command(data, "dispatch") == []
    token = uuid4()
    command(data, "claim", id=job["submissionId"], token=token)
    command(data, "launch", id=job["submissionId"], token=token)
    command(
        data,
        "finish",
        id=job["submissionId"],
        token=token,
        status="failed",
        release=False,
        error="Start uncertain",
    )
    recovered = command(data, "claim", id=job["submissionId"], token=uuid4())
    assert recovered["cleanupOnly"] is True and recovered["phase"] == "launching"
    with data["engine"].connect() as connection:
        assert connection.scalar(
            text("select slot from dsa_execution_private.jobs where id=:id"),
            {"id": job["submissionId"]},
        )


def test_public_json_null_is_preserved_in_execution_results(execution_data):
    data = execution_data
    job = create(data)
    claimed = command(data, "claim", id=job["submissionId"], token=uuid4())
    command(
        data,
        "finish",
        id=claimed["id"],
        token=claimed["token"],
        status="completed",
        result={
            "verdict": "passed_public_tests",
            "publicCases": [
                {"id": "fixture", "input": None, "actualOutput": None, "expectedOutput": None}
            ],
        },
    )
    result = command(data, "get", id=job["submissionId"], userId=data["owner"])["result"]
    assert result["publicCases"][0] == {
        "id": "fixture",
        "input": None,
        "actualOutput": None,
        "expectedOutput": None,
    }


def test_typescript_worker_through_rpc_and_postgres(execution_data):
    """Real SQL/HTTP repository boundary; optional real ConTree, no hosted writes."""
    data = execution_data
    binary = data["rows"]["b"]
    with data["engine"].begin() as connection:
        for ordinal, (visibility, nums, target, expected) in enumerate(
            [
                ("public", [1, 3, 5, 7], 5, 2),
                ("hidden", [-8, -1, 4, 9], 2, -1),
            ]
        ):
            connection.execute(
                insert(Case).values(
                    suite_id=binary["suite"],
                    ordinal=ordinal,
                    category="official",
                    visibility=visibility,
                    validation_status="verified",
                    input_json={"nums": nums, "target": target},
                    expected_json=expected,
                )
            )
        connection.execute(
            text("""insert into dsa_execution_private.certificates
          (problem_version_id,suite_id,contract,public_run_approved,hidden_submit_approved,certified_by,certified_at)
          values (:version,:suite,cast(:contract as jsonb),true,true,:owner,now())"""),
            {
                "version": binary["version"],
                "suite": binary["suite"],
                "owner": data["owner"],
                "contract": json.dumps(
                    {"entrypoint": "solve", "inputMode": "kwargs", "checker": "exact_json"}
                ),
            },
        )
    web = Path(__file__).resolve().parents[3] / "web"
    nodes = list((web / ".next/cache/npm-contree/_npx").glob("*/node_modules/node/bin/node.exe"))
    node = nodes[0] if nodes else "node"

    class Rpc(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/rest/v1/rpc/dsa_execution_command":
                self.send_error(404)
                return
            if self.headers.get("Authorization") != "Bearer local-test-service-role":
                self.send_error(401)
                return
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            result = command(data, body["p_action"], **body["p_args"])
            payload = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Rpc)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {
            **os.environ,
            "DSA_EXECUTION_TEST_API_URL": f"http://127.0.0.1:{server.server_port}",
            "DSA_EXECUTION_TEST_USER": str(data["owner"]),
            "DSA_EXECUTION_TEST_PROBLEM": str(data["row"]["id"]),
            "DSA_EXECUTION_TEST_VERSION": str(data["row"]["version"]),
            "DSA_EXECUTION_TEST_SECOND_PROBLEM": str(binary["id"]),
            "DSA_EXECUTION_TEST_SECOND_VERSION": str(binary["version"]),
        }
        result = subprocess.run(  # noqa: S603
            [
                str(node),
                "node_modules/@playwright/test/cli.js",
                "test",
                "e2e/dsa-execution-integration.spec.ts",
                "--config=playwright.execution.config.ts",
            ],
            cwd=web,
            env=env,
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
        assert result.returncode == 0, result.stdout + result.stderr
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    with data["engine"].connect() as connection:
        assert (
            connection.scalar(
                text("select count(*) from dsa_execution_private.jobs where slot is not null")
            )
            == 0
        )
