"""Exact V3 contract/certification gates; disposable database only."""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from tests.dsa.test_execution_storage import command
from tests.dsa.test_v3_storage import as_user

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def contract_schema(execution_schema, board_schema):
    root = Path(__file__).resolve().parents[3]
    migration = (
        root / "web/supabase/migrations/20261016133229_dsa_v3_versioned_contracts_certification.sql"
    )
    with execution_schema.begin() as connection:
        connection.connection.driver_connection.execute(migration.read_text(encoding="utf-8"))
    return execution_schema


@pytest.fixture
def contract_data(contract_schema, execution_data):
    yield execution_data
    with contract_schema.begin() as connection:
        connection.execute(
            text(
                """
                update dsa_execution_private.certificates set certification_run_id=null
                where suite_id=:suite
                """
            ),
            {"suite": execution_data["row"]["suite"]},
        )
        connection.execute(
            text(
                """
                delete from dsa_execution_private.v3_certification_runs where
                problem_version_id=:version
                """
            ),
            {"version": execution_data["row"]["version"]},
        )
        connection.execute(
            text(
                "delete from dsa_execution_private.v3_contracts where problem_version_id=:version"
            ),
            {"version": execution_data["row"]["version"]},
        )


def test_typed_contract_requires_real_review_exact_ledger_hashes_and_unrevoked_gates(contract_data):
    data = contract_data
    contract = {
        "entrypoint": "total",
        "inputMode": "kwargs",
        "checker": "exact_json",
        "adapter": {
            "id": "reasonai-python",
            "version": 1,
            "invocation": "function",
            "parameters": [{"name": "nums", "pythonType": "List[int]", "codec": "json"}],
            "returnType": "int",
            "result": {"source": "return", "codec": "json"},
        },
    }
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                """
                insert into dsa_execution_private.v3_contracts(problem_version_id,
                contract,source_url,source_sha256,source_notice) values(:version,
                cast(:contract as jsonb),'https://example.invalid/test-only',
                :sha,'Test authored variant')
                """
            ),
            {"version": data["row"]["version"], "contract": json.dumps(contract), "sha": "a" * 64},
        )
        connection.execute(
            text(
                """
                update dsa_execution_private.certificates set contract=cast(:contract
                as jsonb) where suite_id=:suite
                """
            ),
            {"contract": json.dumps(contract), "suite": data["row"]["suite"]},
        )
    args = {"problemId": data["row"]["id"], "problemVersionId": data["row"]["version"]}
    assert command(data, "availability", **args) == {"run": None, "submit": None}
    with data["engine"].begin() as connection:
        as_user(connection, data["owner"])
        assert (
            connection.scalar(
                text("select dsa_v3_problem_contract(:id,:version)"),
                {"id": data["row"]["id"], "version": data["row"]["version"]},
            )
            is None
        )
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                """
                update dsa_execution_private.v3_contracts set status='approved',
                reviewed_by=:owner,reviewed_at=now(),review_evidence='{"fixture":"TEST ONLY"}'
                where problem_version_id=:version
                """
            ),
            {"owner": data["owner"], "version": data["row"]["version"]},
        )
    with data["engine"].begin() as connection:
        as_user(connection, data["owner"])
        public = connection.scalar(
            text("select dsa_v3_problem_contract(:id,:version)"),
            {"id": data["row"]["id"], "version": data["row"]["version"]},
        )
        assert public["contract"] == contract
        assert not {"review_evidence", "source_sha256", "fixtures", "reference"} & public.keys()
    assert command(data, "availability", **args)["run"] is None
    run_id = uuid4()
    checks = {
        key: True
        for key in (
            "statement",
            "source",
            "adapter",
            "starter",
            "publicFixtures",
            "hiddenFixtures",
            "independentOracle",
            "checker",
            "duplicateAudit",
            "overlapAudit",
            "boundaryCoverage",
            "stressCoverage",
            "realPython",
            "judgeVerdicts",
            "sandboxCompatibility",
            "certificateEligibility",
        )
    }
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                """
                insert into dsa_execution_private.v3_certification_runs(id,problem_version_id,
                suite_id,contract_sha256,fixtures_sha256,harness_sha256,manifest_sha256,
                checks,evidence,status,reviewed_by,reviewed_at) select :id,:version,
                :suite,encode(sha256(convert_to(contract::text,'UTF8')),'hex'),
                dsa_execution_private.v3_fixture_sha(:suite),:sha,:sha,cast(:checks
                as jsonb),'{"fixture":"TEST ONLY"}','approved',:owner,now() from
                dsa_execution_private.v3_contracts where problem_version_id=:version
                """
            ),
            {
                "id": run_id,
                "version": data["row"]["version"],
                "suite": data["row"]["suite"],
                "sha": "b" * 64,
                "checks": json.dumps(checks),
                "owner": data["owner"],
            },
        )
        connection.execute(
            text(
                """
                update dsa_execution_private.certificates set certification_run_id=:id
                where suite_id=:suite
                """
            ),
            {"id": run_id, "suite": data["row"]["suite"]},
        )
    plan = command(data, "availability", **args)["submit"]
    assert plan["certificationRunId"] == str(run_id)
    assert len(plan["fixturesRevision"]) == 64
    with data["engine"].begin() as connection:
        connection.execute(
            text(
                """
                update dsa_test_cases set expected_json='999'::jsonb where suite_id=:suite
                and visibility='hidden'
                """
            ),
            {"suite": data["row"]["suite"]},
        )
    assert command(data, "availability", **args) == {"run": None, "submit": None}


def test_registry_and_ledger_are_private_and_approval_cannot_omit_checks(contract_data):
    data = contract_data
    with pytest.raises(DBAPIError), data["engine"].begin() as connection:
        as_user(connection, data["owner"])
        connection.exec_driver_sql("select * from dsa_execution_private.v3_contracts")
    with pytest.raises(DBAPIError), data["engine"].begin() as connection:
        connection.exec_driver_sql("set local role anon")
        connection.exec_driver_sql("select public.dsa_v3_problem_contract(null,null)")
    with pytest.raises(DBAPIError), data["engine"].begin() as connection:
        connection.execute(
            text(
                """
                insert into dsa_execution_private.v3_certification_runs(problem_version_id,
                suite_id,contract_sha256,fixtures_sha256,harness_sha256,manifest_sha256,
                status,reviewed_by,reviewed_at,evidence) values(:version,:suite,
                :sha,:sha,:sha,:sha,'approved',:owner,now(),'{"note":"not enough"}')
                """
            ),
            {
                "version": data["row"]["version"],
                "suite": data["row"]["suite"],
                "sha": "a" * 64,
                "owner": data["owner"],
            },
        )
