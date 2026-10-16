from datetime import UTC, datetime, timedelta
from statistics import quantiles
from time import perf_counter
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import insert, select, text, update

from recallstack.main import create_app
from recallstack.modules.content.infrastructure.sqlalchemy_models import ContentItemModel
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    DefinitionModel,
    RuntimeModel,
    SuiteModel,
    VersionModel,
)
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    TestCaseModel as Case,
)
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.modules.learning.infrastructure.sqlalchemy_models import UserNoteModel
from recallstack.modules.practice.infrastructure.sqlalchemy_models import PracticeAttemptModel
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings

pytestmark = pytest.mark.integration


@pytest.fixture
async def api(dataset):
    app = create_app(
        Settings(
            _env_file=None,
            database_url=dataset["engine"].url.render_as_string(hide_password=False),
            supabase_project_url="https://example.supabase.co",
            app_env="test",
        )
    )
    owner = dataset["owner"]
    user = CurrentUser(owner, owner, frozenset({"reviewer"}))

    class Provider:
        async def from_access_token(self, token):
            return user

    app.dependency_overrides[get_current_user] = lambda: user
    async with app.router.lifespan_context(app):
        app.state.current_user_provider = Provider()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client


def filters(dataset, **kwargs):
    return {"category": str(dataset["category"]), **kwargs}


async def test_v3_slug_uuid_resolution_and_exact_version_gates(api, dataset):
    row = dataset["rows"]["a"]
    detail = (await api.get(f"/api/v1/dsa/problems/{row['id']}")).json()
    for identifier in (str(row["id"]), detail["slug"]):
        response = await api.get(
            "/api/v1/dsa/resolve",
            params={"problem": identifier, "problem_version_id": str(row["version"])},
        )
        assert response.status_code == 200, response.text
        assert response.json()["id"] == str(row["id"])
        assert "function_contract" not in response.json()
    response = await api.get(
        "/api/v1/dsa/resolve",
        params={"problem": detail["slug"], "problem_version_id": str(uuid4())},
    )
    assert response.status_code == 404
    for kind in ("draft", "unapproved", "other"):
        response = await api.get(
            "/api/v1/dsa/resolve", params={"problem": str(dataset["rows"][kind]["id"])}
        )
        assert response.status_code == 404


async def test_v3_topic_progress_joins_only_visible_content(api, dataset):
    from recallstack.modules.learning.infrastructure.sqlalchemy_models import UserProgressModel

    with dataset["engine"].begin() as connection:
        for kind in ("a", "unapproved"):
            connection.execute(
                insert(UserProgressModel).values(
                    user_id=dataset["owner"],
                    content_item_id=dataset["rows"][kind]["id"],
                    status="mastered",
                )
            )
        connection.execute(
            insert(UserProgressModel).values(
                user_id=dataset["other"],
                content_item_id=dataset["rows"]["b"]["id"],
                status="mastered",
            )
        )
    response = await api.get(
        "/api/v1/dsa/me/topic-progress", headers={"Authorization": "Bearer owner"}
    )
    assert response.status_code == 200, response.text
    category = next(
        item for item in response.json()["items"] if item["id"] == str(dataset["category"])
    )
    assert category["attempted_count"] == category["mastered_count"] == 1


async def test_catalog_publication_domain_and_keyset(api, dataset):
    response = await api.get("/api/v1/dsa/problems", params=filters(dataset, limit=1))
    assert response.status_code == 200, response.text
    first = response.json()
    assert first["has_more"] and len(first["items"]) == 1
    identifiers = [first["items"][0]["id"]]
    cursor = first["next_cursor"]
    while cursor:
        response = await api.get(
            "/api/v1/dsa/problems", params=filters(dataset, limit=1, cursor=cursor)
        )
        assert response.status_code == 200, response.text
        identifiers.extend(item["id"] for item in response.json()["items"])
        cursor = response.json()["next_cursor"]
    expected = sorted(
        [dataset["rows"][k] for k in ("a", "b", "z")],
        key=lambda row: (row["title"].strip().lower(), row["id"]),
    )
    assert identifiers == [str(row["id"]) for row in expected]
    response = await api.get("/api/v1/dsa/problems", params=filters(dataset, search="Zebra"))
    assert [row["id"] for row in response.json()["items"]] == [str(dataset["rows"]["z"]["id"])]
    response = await api.get("/api/v1/dsa/problems", params=filters(dataset, search="%"))
    assert response.json()["items"] == []
    for extra in ({"difficulty": "hard"}, {"topic": str(uuid4())}):
        response = await api.get("/api/v1/dsa/problems", params=filters(dataset, **extra))
        assert response.status_code == 200 and response.json()["items"] == []
    response = await api.get(
        "/api/v1/dsa/problems", params=filters(dataset, topic=str(dataset["topic"]))
    )
    assert len(response.json()["items"]) == 3
    response = await api.get(
        "/api/v1/dsa/problems",
        params=filters(dataset, preview=True),
        headers={"Authorization": "Bearer reviewer"},
    )
    assert len(response.json()["items"]) == 6
    assert "SECRET" not in response.text


async def test_details_version_selection_and_no_foreign_preview(api, dataset):
    row = dataset["rows"]["a"]
    response = await api.get(f"/api/v1/dsa/problems/{row['id']}")
    assert response.status_code == 200, response.text
    assert response.json()["problem_version_id"] == str(row["version"])
    assert "SECRET" not in response.text
    assert "implementation" not in response.text
    assert response.json()["supported_contract_languages"] == ["python"]
    for kind in ("draft", "unapproved", "string_approval", "other"):
        protected = dataset["rows"][kind]
        response = await api.get(f"/api/v1/dsa/problems/{protected['id']}")
        assert response.status_code == 404, (kind, response.text)
    with dataset["engine"].begin() as connection:
        latest = connection.scalar(
            insert(VersionModel)
            .values(
                definition_id=row["definition"],
                version_number=3,
                status="needs_review",
                specification={"title": "Latest draft", "problem_statement": "Preview only"},
            )
            .returning(VersionModel.id)
        )
    response = await api.get(f"/api/v1/dsa/problems/{row['id']}")
    assert response.json()["problem_version_id"] == str(row["version"])
    response = await api.get(
        f"/api/v1/dsa/problems/{row['id']}",
        params={"preview": True},
        headers={"Authorization": "Bearer reviewer"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["problem_version_id"] == str(latest)
    assert response.json()["availability"] == "review_pending"
    response = await api.get(
        f"/api/v1/dsa/problems/{row['id']}",
        params={
            "preview": True,
            "problem_version_id": str(dataset["rows"]["z"]["version"]),
        },
        headers={"Authorization": "Bearer reviewer"},
    )
    assert response.status_code == 404
    response = await api.get(
        f"/api/v1/dsa/problems/{row['id']}", params={"problem_version_id": str(latest)}
    )
    assert response.status_code == 404


async def test_null_pointer_and_archived_base_fail_closed(api, dataset):
    row = dataset["rows"]["a"]
    with dataset["engine"].begin() as connection:
        connection.execute(
            update(DefinitionModel)
            .where(DefinitionModel.id == row["definition"])
            .values(current_version_id=None)
        )
    assert (await api.get(f"/api/v1/dsa/problems/{row['id']}")).status_code == 404
    row = dataset["rows"]["b"]
    with dataset["engine"].begin() as connection:
        connection.execute(
            update(ContentItemModel)
            .where(ContentItemModel.id == row["id"])
            .values(archived_at=datetime.now(UTC))
        )
    assert (await api.get(f"/api/v1/dsa/problems/{row['id']}")).status_code == 404


async def test_verified_public_tests_only_and_no_suite_fallback(api, dataset):
    row = dataset["rows"]["a"]
    with dataset["engine"].begin() as connection:
        for ordinal, (visibility, state) in enumerate(
            [
                ("public", "verified"),
                ("public", "pending"),
                ("public", "rejected"),
                ("hidden", "verified"),
                ("hidden", "pending"),
                ("hidden", "rejected"),
            ]
        ):
            connection.execute(
                insert(Case).values(
                    suite_id=row["suite"],
                    ordinal=ordinal,
                    category="official",
                    visibility=visibility,
                    validation_status=state,
                    input_json={"nums": [ordinal]},
                    expected_json=ordinal,
                    provenance={"reference_solution_python": "SECRET"},
                )
            )
    path = f"/api/v1/dsa/problems/{row['id']}/test-cases"
    response = await api.get(path, params={"problem_version_id": str(row["version"])})
    assert response.status_code == 200, response.text
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["input_json"] == {"nums": [0]}
    assert "SECRET" not in response.text
    assert "provenance" not in response.text
    with dataset["engine"].begin() as connection:
        connection.execute(
            insert(SuiteModel).values(
                problem_version_id=row["version"], suite_version=2, status="needs_review"
            )
        )
    response = await api.get(path)
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["has_verified_public_tests"] is False
    # Statement examples exist, but do not become test fixtures.
    empty = dataset["rows"]["z"]
    response = await api.get(f"/api/v1/dsa/problems/{empty['id']}/test-cases")
    assert response.json()["items"] == []


async def test_taxonomy_counts_and_runtime_separation(api, dataset):
    for path, identifier in (("categories", dataset["category"]), ("topics", dataset["topic"])):
        response = await api.get(f"/api/v1/dsa/{path}")
        assert response.status_code == 200, response.text
        target = next(row for row in response.json()["items"] if row["id"] == str(identifier))
        assert target["problem_count"] == 3
    with dataset["engine"].begin() as connection:
        connection.execute(
            insert(RuntimeModel).values(
                language=f"runtime-{dataset['token']}", runtime_version="1", enabled=True
            )
        )
    response = await api.get("/api/v1/dsa/capabilities")
    assert response.status_code == 200, response.text
    assert response.json()["published_contract_languages"] == ["python"]
    assert f"runtime-{dataset['token']}" in response.json()["configured_runtime_languages"]
    assert response.json()["execution_languages"] == []


async def test_learning_services_transitions_concurrency_and_sync(api, dataset):
    row = dataset["rows"]["a"]
    path = f"/api/v1/dsa/me/problems/{row['id']}/progress"
    response = await api.get(path)
    assert response.status_code == 200, response.text
    assert response.json()["row_version"] == 0
    response = await api.patch(path, json={"row_version": 0, "status": "mastered"})
    assert response.status_code == 422
    response = await api.patch(
        path, json={"row_version": 0, "status": "learning", "confidence": 30}
    )
    assert response.status_code == 200, response.text
    assert response.json()["row_version"] == 1
    assert response.json()["sync_cursor"] == 1
    assert response.json()["updated_at"].endswith("Z")
    response = await api.patch(path, json={"row_version": 0, "confidence": 40})
    assert response.status_code == 409
    response = await api.patch(path, json={"row_version": 1, "confidence": 40})
    assert response.status_code == 200 and response.json()["status"] == "learning"
    # Existing API sees the same record, with unchanged response behavior.
    response = await api.get(f"/api/v1/me/progress/{row['id']}")
    assert response.json()["row_version"] == 2
    with dataset["engine"].connect() as connection:
        count = connection.scalar(
            text("SELECT count(*) FROM user_sync_change_log WHERE user_id=:id"),
            {"id": dataset["owner"]},
        )
        assert count == 2
    other = dataset["rows"]["other"]
    response = await api.patch(
        f"/api/v1/dsa/me/problems/{other['id']}/progress",
        json={"row_version": 0, "status": "learning"},
    )
    assert response.status_code == 404
    response = await api.get("/api/v1/dsa/me/progress")
    assert len(response.json()["items"]) == 1


async def test_bookmarks_idempotency_and_domain_isolation(api, dataset):
    row = dataset["rows"]["a"]
    for changed in (True, False):
        response = await api.post("/api/v1/dsa/me/bookmarks", json={"problem_id": str(row["id"])})
        assert response.status_code == 200, response.text
        assert response.json()["changed"] is changed
    response = await api.get("/api/v1/dsa/me/bookmarks")
    assert [r["content_item_id"] for r in response.json()["items"]] == [str(row["id"])]
    for _ in range(2):
        assert (await api.delete(f"/api/v1/dsa/me/bookmarks/{row['id']}")).status_code == 204
    other = dataset["rows"]["other"]
    response = await api.post("/api/v1/dsa/me/bookmarks", json={"problem_id": str(other["id"])})
    assert response.status_code == 404


async def test_multiple_notes_soft_delete_ownership_and_domain(api, dataset):
    row = dataset["rows"]["a"]
    path = f"/api/v1/dsa/me/problems/{row['id']}/notes"
    first = await api.post(path, json={"kind": "note", "body": "First"})
    second = await api.post(path, json={"kind": "mistake", "body": "Second"})
    assert first.status_code == second.status_code == 201, (first.text, second.text)
    first_id = first.json()["id"]
    assert len((await api.get(path)).json()["items"]) == 2
    response = await api.patch(
        f"/api/v1/dsa/me/notes/{first_id}", json={"row_version": 1, "body": "Updated"}
    )
    assert response.status_code == 200, response.text
    response = await api.patch(
        f"/api/v1/dsa/me/notes/{first_id}", json={"row_version": 1, "body": "Stale"}
    )
    assert response.status_code == 409
    with dataset["engine"].begin() as connection:
        foreign = connection.scalar(
            insert(UserNoteModel)
            .values(
                content_item_id=row["id"],
                user_id=dataset["other"],
                kind="note",
                body="Other user",
            )
            .returning(UserNoteModel.id)
        )
        outside = connection.scalar(
            insert(UserNoteModel)
            .values(
                content_item_id=dataset["rows"]["other"]["id"],
                user_id=dataset["owner"],
                kind="note",
                body="Other domain",
            )
            .returning(UserNoteModel.id)
        )
    for identifier in (foreign, outside):
        response = await api.patch(
            f"/api/v1/dsa/me/notes/{identifier}", json={"row_version": 1, "body": "Forbidden"}
        )
        assert response.status_code == 404
        response = await api.request(
            "DELETE", f"/api/v1/dsa/me/notes/{identifier}", json={"row_version": 1}
        )
        assert response.status_code == 404
    response = await api.request(
        "DELETE", f"/api/v1/dsa/me/notes/{first_id}", json={"row_version": 2}
    )
    assert response.status_code == 204, response.text
    assert response.headers["x-row-version"] == "3"
    assert len((await api.get(path)).json()["items"]) == 1
    with dataset["engine"].connect() as connection:
        assert (
            connection.scalar(select(UserNoteModel.deleted_at).where(UserNoteModel.id == first_id))
            is not None
        )
        count = connection.scalar(
            text("SELECT count(*) FROM user_sync_change_log WHERE user_id=:id"),
            {"id": dataset["owner"]},
        )
        assert count == 4


async def test_history_statistics_dates_ownership_and_domains(api, dataset):
    row = dataset["rows"]["a"]
    now = datetime(2026, 10, 15, tzinfo=UTC)
    with dataset["engine"].begin() as connection:
        for user, target, timestamp in [
            (dataset["owner"], row, now),
            (dataset["owner"], row, now + timedelta(hours=1)),
            (dataset["other"], row, now),
            (dataset["owner"], dataset["rows"]["other"], now),
        ]:
            connection.execute(
                insert(PracticeAttemptModel).values(
                    attempt_event_id=uuid4(),
                    user_id=user,
                    content_item_id=target["id"],
                    practice_resource_id=target["resource"],
                    provider_id=dataset["provider"],
                    outcome="solved_with_hint",
                    attempted_at=timestamp,
                )
            )
    response = await api.get("/api/v1/dsa/me/practice-history", params={"limit": 1})
    assert response.status_code == 200, response.text
    assert response.json()["has_more"]
    assert response.json()["items"][0]["attempted_at"].endswith("Z")
    first_id = response.json()["items"][0]["id"]
    response = await api.get(
        "/api/v1/dsa/me/practice-history",
        params={
            "limit": 1,
            "cursor": response.json()["next_cursor"],
        },
    )
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["id"] != first_id
    response = await api.get(
        "/api/v1/dsa/me/practice-history",
        params={
            "start_at": now.isoformat(),
            "end_at": (now + timedelta(hours=1)).isoformat(),
        },
    )
    assert len(response.json()["items"]) == 1
    response = await api.get("/api/v1/dsa/me/statistics")
    assert response.status_code == 200, response.text
    stats = response.json()
    assert stats["practice_attempt_count"] == stats["self_reported_solved_attempt_count"] == 2
    assert stats["attempted_problem_count"] == 1
    assert stats["mastered_problem_count"] == 0
    assert sum(stats["learning_status_counts"].values()) == 0


async def test_local_latency_samples(api, dataset, record_property):
    row = dataset["rows"]["a"]
    for name, path in (
        ("catalog", "/api/v1/dsa/problems"),
        ("detail", f"/api/v1/dsa/problems/{row['id']}"),
        ("progress", f"/api/v1/dsa/me/problems/{row['id']}/progress"),
    ):
        samples = []
        for _ in range(20):
            started = perf_counter()
            response = await api.get(path)
            assert response.status_code == 200, response.text
            samples.append((perf_counter() - started) * 1000)
        p95 = quantiles(samples, n=100, method="inclusive")[94]
        record_property(f"{name}_p95_ms", round(p95, 2))
        print(f"LOCAL ASGI + disposable PostgreSQL {name} p95_ms={p95:.2f} n=20")
