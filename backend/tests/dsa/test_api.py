from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from sqlalchemy.exc import OperationalError

from recallstack.main import create_app
from recallstack.modules.dsa.application.cursor import decode_cursor, encode_cursor
from recallstack.modules.dsa.application.services import DsaService
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings
from recallstack.shared.errors import AppError


def problem(**overrides):
    return {
        "id": uuid4(),
        "slug": "two-sum",
        "title": "Two Sum",
        "sort_title": "two sum",
        "difficulty": "easy",
        "problem_version_id": uuid4(),
        "content_version_id": uuid4(),
        "categories": [],
        "topics": [],
        "approved": True,
        "description": "Find a pair",
        "function_contract": {"function": "solve", "input": "nums"},
        "constraints": ["nonempty"],
        "examples": [{"input": {"nums": [1, 2]}, "output": 3}],
        **overrides,
    }


@pytest.fixture
async def api():
    app = create_app(
        Settings(
            _env_file=None,
            database_url=None,
            supabase_project_url="https://example.supabase.co",
            app_env="test",
        )
    )
    store = SimpleNamespace(
        catalog=AsyncMock(return_value=[]),
        detail=AsyncMock(return_value=None),
        metadata=AsyncMock(return_value=[]),
        tests=AsyncMock(return_value=[]),
        history=AsyncMock(return_value=[]),
        statistics=AsyncMock(),
        languages=AsyncMock(
            return_value={
                "published_contract_languages": [],
                "configured_runtime_languages": ["python"],
                "execution_languages": [],
            }
        ),
    )

    @asynccontextmanager
    async def repository():
        yield store

    user_id = uuid4()
    user = CurrentUser(user_id, user_id, frozenset())
    provider = SimpleNamespace(from_access_token=AsyncMock(return_value=user))
    async with app.router.lifespan_context(app):
        app.state.dsa_service = DsaService(repository)
        app.state.current_user_provider = provider
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield SimpleNamespace(app=app, store=store, client=client, user=user, provider=provider)


async def test_empty_catalog_and_capabilities(api):
    response = await api.client.get("/api/v1/dsa/problems")
    assert response.status_code == 200
    assert response.json() == {"items": [], "has_more": False, "next_cursor": None}
    assert response.headers["cache-control"] == "private, no-store"
    response = await api.client.get("/api/v1/dsa/capabilities")
    assert response.status_code == 200
    assert response.json()["sandbox_execution"] is False
    assert response.json()["ai_tutoring"] is False
    assert response.json()["configured_runtime_languages"] == ["python"]
    assert response.json()["execution_languages"] == []


async def test_cross_origin_clients_can_read_sync_headers(api):
    response = await api.client.get(
        "/api/v1/dsa/problems", headers={"Origin": "https://client.example"}
    )
    assert response.status_code == 200
    assert "X-Sync-Cursor" in response.headers["access-control-expose-headers"]
    assert "X-Row-Version" in response.headers["access-control-expose-headers"]


@pytest.mark.parametrize(
    "suffix",
    [
        "progress",
        "bookmarks",
        "practice-history",
        "statistics",
        f"problems/{uuid4()}/notes",
        f"problems/{uuid4()}/progress",
    ],
)
async def test_learner_routes_require_auth(api, suffix):
    response = await api.client.get(f"/api/v1/dsa/me/{suffix}")
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json()["request_id"]


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 51},
        {"limit": 0},
        {"sort": "random"},
        {"difficulty": "impossible"},
        {"topic": "invalid"},
        {"cursor": "bad"},
        {"cursor": "x" * 2049},
    ],
)
async def test_invalid_catalog_inputs(api, params):
    response = await api.client.get("/api/v1/dsa/problems", params=params)
    assert response.status_code == 422
    assert response.json()["type"].endswith("validation-error")


async def test_keyset_cursor_and_filter_binding(api):
    first, second = problem(), problem(title="Zebra", sort_title="zebra")
    api.store.catalog.return_value = [first, second]
    response = await api.client.get("/api/v1/dsa/problems", params={"limit": 1, "search": " sum "})
    assert response.status_code == 200
    payload = response.json()
    assert payload["has_more"] and len(payload["items"]) == 1
    token = payload["next_cursor"]
    api.store.catalog.return_value = [second]
    response = await api.client.get(
        "/api/v1/dsa/problems",
        params={
            "limit": 1,
            "search": "SUM",
            "cursor": token,
        },
    )
    assert response.status_code == 200
    assert api.store.catalog.call_args.args[1] == ("two sum", first["id"])
    for params in ({"search": "other"}, {"preview": True}):
        response = await api.client.get("/api/v1/dsa/problems", params={"cursor": token, **params})
        assert response.status_code in (401, 422)


async def test_detail_allowlist_and_nested_confidentiality(api):
    row = problem(
        provenance={"reference_solution_python": "SECRET"},
        function_contract={
            "function": "solve",
            "input": {"nums": "list[int]", "reference_solution_python": "SECRET"},
            "implementation": "SECRET",
            "reference_compiled": True,
        },
        examples=[
            {
                "input": {"nums": [1], "provenance": {"hidden_tests": "SECRET"}},
                "output": None,
                "reviewer_notes": "SECRET",
            }
        ],
    )
    api.store.detail.return_value = row
    response = await api.client.get(f"/api/v1/dsa/problems/{row['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == str(row["id"])
    assert response.json()["problem_version_id"] == str(row["problem_version_id"])
    assert "SECRET" not in response.text
    assert "provenance" not in response.text
    assert "reference_compiled" not in response.text
    assert "implementation" not in response.text


async def test_not_found_and_invalid_uuid(api):
    response = await api.client.get(f"/api/v1/dsa/problems/{uuid4()}")
    assert response.status_code == 404
    response = await api.client.get("/api/v1/dsa/problems/not-a-uuid")
    assert response.status_code == 422


@pytest.mark.parametrize(
    "roles,status",
    [
        (frozenset(), 403),
        (frozenset({"content_editor"}), 403),
        (frozenset({"reviewer"}), 200),
        (frozenset({"admin"}), 200),
    ],
)
async def test_preview_authorization(api, roles, status):
    row = problem(approved=False)
    api.store.detail.return_value = row
    api.provider.from_access_token.return_value = CurrentUser(
        api.user.profile_id, api.user.auth_subject, roles
    )
    response = await api.client.get(
        f"/api/v1/dsa/problems/{row['id']}",
        params={"preview": True},
        headers={"Authorization": "Bearer x"},
    )
    assert response.status_code == status
    assert response.headers["cache-control"] == "private, no-store"
    if status == 200:
        assert response.json()["availability"] == "review_pending"
        assert api.store.detail.call_args.args[1] is True
    else:
        api.store.detail.assert_not_called()


async def test_test_cases_pin_version_and_return_empty_without_fallback(api):
    row = problem()
    api.store.detail.return_value = row
    response = await api.client.get(
        f"/api/v1/dsa/problems/{row['id']}/test-cases",
        params={"problem_version_id": str(row["problem_version_id"])},
    )
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["has_verified_public_tests"] is False
    assert response.json()["problem_version_id"] == str(row["problem_version_id"])
    api.store.tests.assert_awaited_once_with(row["problem_version_id"], None, 20)
    assert api.store.detail.call_args.args[2] == row["problem_version_id"]


@pytest.mark.parametrize(
    "error",
    [
        OperationalError("PRIVATE SQL", {}, Exception("SECRET")),
        OSError("SECRET"),
        TimeoutError("SECRET"),
        RuntimeError("DATABASE_URL is not configured"),
    ],
)
async def test_database_unavailability_is_safe(api, error):
    api.store.catalog.side_effect = error
    response = await api.client.get("/api/v1/dsa/problems")
    assert response.status_code == 503
    assert "SECRET" not in response.text and "PRIVATE SQL" not in response.text
    assert response.json()["type"].endswith("dependency-unavailable")


async def test_unexpected_errors_keep_safe_response_and_cache_policy(api):
    api.store.catalog.side_effect = ValueError("SECRET")
    response = await api.client.get("/api/v1/dsa/problems")
    assert response.status_code == 500
    assert "SECRET" not in response.text
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize(
    "params",
    [
        {"start_at": "2026-10-15T00:00:00"},
        {"start_at": "2026-10-15T00:00:00Z", "end_at": "2026-10-15T00:00:00Z"},
        {"start_at": "2026-10-15T00:00:00Z", "end_at": "2026-10-14T00:00:00Z"},
    ],
)
async def test_history_date_validation(api, params):
    api.app.dependency_overrides[get_current_user] = lambda: api.user
    response = await api.client.get("/api/v1/dsa/me/practice-history", params=params)
    assert response.status_code == 422


async def test_history_cursor_is_user_bound_and_utc(api):
    api.app.dependency_overrides[get_current_user] = lambda: api.user
    now = datetime(2026, 10, 15, tzinfo=UTC)
    rows = [
        {
            "id": uuid4(),
            "content_item_id": uuid4(),
            "attempted_at": now,
            "outcome": "skipped",
            "duration_seconds": None,
            "hint_used": False,
            "confidence_before": None,
            "confidence_after": None,
        }
        for _ in range(2)
    ]
    api.store.history.return_value = rows
    response = await api.client.get("/api/v1/dsa/me/practice-history", params={"limit": 1})
    assert response.status_code == 200
    token = response.json()["next_cursor"]
    other = uuid4()
    api.app.dependency_overrides[get_current_user] = lambda: CurrentUser(other, other, frozenset())
    response = await api.client.get("/api/v1/dsa/me/practice-history", params={"cursor": token})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"row_version": 0},
        {"row_version": 0, "confidence": 101},
        {"row_version": 0, "status": None},
        {"row_version": 0, "confidence": -1},
        {"row_version": 0, "judge_verified": True},
    ],
)
async def test_progress_payload_validation(api, payload):
    api.app.dependency_overrides[get_current_user] = lambda: api.user
    response = await api.client.patch(f"/api/v1/dsa/me/problems/{uuid4()}/progress", json=payload)
    assert response.status_code == 422


def test_cursor_validation_and_round_trip():
    scope = {"kind": "catalog"}
    key = ["title", str(uuid4())]
    assert decode_cursor(encode_cursor(scope, key), scope) == key
    for token in ("", "{broken", "!!!!", "eyJ2IjoyfQ", "W10", "bnVsbA"):
        with pytest.raises(AppError) as error:
            decode_cursor(token, scope)
        assert error.value.status == 422


def test_all_routes_registered_once_and_existing_routes_preserved():
    app = create_app(
        Settings(
            _env_file=None,
            database_url=None,
            supabase_project_url="https://example.supabase.co",
            app_env="test",
        )
    )
    schema = app.openapi()
    operations = [
        op["operationId"]
        for path, methods in schema["paths"].items()
        if path.startswith("/api/v1/dsa/")
        for op in methods.values()
    ]
    assert len(operations) == len(set(operations)) == 18
    assert "/api/v1/me/progress/{contentId}" in schema["paths"]
    assert "/api/v1/practice/attempts" in schema["paths"]
