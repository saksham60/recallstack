from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI

from recallstack.main import create_app
from recallstack.modules.admin.application.analytics import AdminAnalyticsService
from recallstack.modules.admin.infrastructure.analytics_repository import (
    SqlAlchemyAdminAnalyticsRepository,
)
from recallstack.modules.admin.presentation.analytics_routes import (
    get_admin_analytics_service,
)
from recallstack.modules.identity.presentation.dependencies import (
    get_current_user,
    get_current_user_provider,
)
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings
from recallstack.shared.errors import AppError, AuthenticationError

TARGET_USER_ID = UUID("00000000-0000-0000-0000-000000000101")
TARGET_PROBLEM_ID = UUID("00000000-0000-0000-0000-000000000201")
NOW = datetime(2026, 7, 28, 12, tzinfo=UTC)


class StubAnalyticsService:
    async def overview(self, **kwargs: object) -> dict[str, object]:
        del kwargs
        return {
            "users": {
                "total": 2,
                "new_today": 1,
                "new_last_7_days": 1,
                "new_last_30_days": 2,
                "active_last_24_hours": 1,
                "active_last_7_days": 2,
                "active_last_30_days": 2,
            },
            "problems": {
                "total_published": 3,
                "total_attempts": 4,
                "accepted_attempts": 2,
                "unique_user_problem_attempts": 3,
                "unique_user_problem_completions": 2,
                "completion_rate": 2 / 3,
            },
            "progress": {
                "average_unique_problems_completed": 1.0,
                "users_with_zero_completions": 1,
                "users_with_1_to_69_completions": 1,
                "users_with_70_to_99_completions": 0,
                "users_with_100_or_more_completions": 0,
            },
            "generated_at": datetime.now(UTC),
        }

    async def list_users(self, **kwargs: object) -> tuple[int, list[dict[str, object]]]:
        del kwargs
        return 1, [
            {
                "user_id": TARGET_USER_ID,
                "name": "Ada",
                "email": "ada@example.test",
                "created_at": NOW,
                "last_active_at": NOW,
                "account_status": "active",
                "unique_problems_attempted": 1,
                "unique_problems_completed": 1,
                "current_streak": None,
                "readiness_score": None,
                "interview_unlock": {
                    "required_completions": 100,
                    "current_completions": 1,
                    "remaining_completions": 99,
                    "eligible": False,
                },
            }
        ]

    async def user_detail(self, user_id: UUID, **kwargs: object) -> dict[str, object]:
        del kwargs
        if user_id != TARGET_USER_ID:
            raise AppError(
                error_type="user-not-found",
                title="User not found",
                status=404,
                detail="The requested user was not found",
            )
        return {
            "profile": {
                "user_id": user_id,
                "name": "Ada",
                "email": "ada@example.test",
                "created_at": NOW,
                "last_active_at": NOW,
                "account_status": "active",
            },
            "progress_summary": {
                "unique_problems_attempted": 1,
                "unique_problems_completed": 1,
                "total_attempts": 1,
                "accepted_attempts": 1,
                "first_attempt_successes": 1,
                "first_attempt_success_rate": 1.0,
                "current_streak": None,
                "longest_streak": None,
                "readiness_score": None,
            },
            "interview_unlock": {
                "required_completions": 100,
                "current_completions": 1,
                "remaining_completions": 99,
                "eligible": False,
            },
            "difficulty_breakdown": [
                {"difficulty": value, "attempted": 0, "completed": 0}
                for value in ("beginner", "easy", "medium", "hard", "expert")
            ],
            "topic_progress": [],
            "revision_summary": {
                "available": True,
                "total_revision_items": 0,
                "completed_revisions": 0,
                "overdue_revisions": 0,
                "last_revision_at": None,
            },
            "mock_test_summary": {
                "available": False,
                "total_attempts": 0,
                "completed_tests": 0,
                "average_score": None,
            },
        }

    async def activity(self, user_id: UUID, **kwargs: object) -> tuple[int, list[object]]:
        del kwargs
        if user_id != TARGET_USER_ID:
            raise AppError(
                error_type="user-not-found",
                title="User not found",
                status=404,
                detail="The requested user was not found",
            )
        return 0, []

    async def list_problems(self, **kwargs: object) -> tuple[int, list[dict[str, object]]]:
        del kwargs
        return 1, [self._problem()]

    async def problem_detail(self, problem_id: UUID, **kwargs: object) -> dict[str, object]:
        del kwargs
        if problem_id != TARGET_PROBLEM_ID:
            raise AppError(
                error_type="problem-not-found",
                title="Problem not found",
                status=404,
                detail="The requested problem was not found",
            )
        problem = self._problem()
        return {
            "problem": {
                key: problem[key]
                for key in ("problem_id", "title", "difficulty", "publication_status", "topics")
            },
            "analytics": {
                key: problem[key]
                for key in (
                    "total_attempts",
                    "accepted_attempts",
                    "unique_users_attempted",
                    "unique_users_completed",
                    "solve_rate",
                    "first_attempt_success_rate",
                    "average_attempts_before_completion",
                    "average_solve_time_seconds",
                    "hint_usage_count",
                )
            },
            "recent_attempts": [],
        }

    async def audit_logs(self, **kwargs: object) -> tuple[int, list[object]]:
        del kwargs
        return 0, []

    @staticmethod
    def _problem() -> dict[str, object]:
        return {
            "problem_id": TARGET_PROBLEM_ID,
            "title": "Two Sum",
            "difficulty": "easy",
            "publication_status": "published",
            "topics": ["Arrays"],
            "total_attempts": 1,
            "accepted_attempts": 1,
            "unique_users_attempted": 1,
            "unique_users_completed": 1,
            "solve_rate": 1.0,
            "first_attempt_successes": 1,
            "first_attempt_success_rate": 1.0,
            "average_attempts_before_completion": 1.0,
            "average_solve_time_seconds": None,
            "hint_usage_count": None,
        }


def _app(user: CurrentUser | None) -> FastAPI:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_admin_analytics_service] = lambda: StubAnalyticsService()
    return app


class RejectingCurrentUserProvider:
    async def from_access_token(self, token: str) -> CurrentUser:
        del token
        raise AuthenticationError("Bearer token is invalid or expired")


ADMIN_ENDPOINTS = (
    "/api/v1/admin/overview",
    "/api/v1/admin/users",
    f"/api/v1/admin/users/{TARGET_USER_ID}",
    f"/api/v1/admin/users/{TARGET_USER_ID}/activity",
    "/api/v1/admin/problems/analytics",
    f"/api/v1/admin/problems/{TARGET_PROBLEM_ID}/analytics",
    "/api/v1/admin/audit-logs",
)


async def test_admin_overview_is_authorized_and_typed() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/admin/overview")
    assert response.status_code == 200
    assert response.json()["problems"]["completion_rate"] == 2 / 3
    assert "authorization" not in response.text.lower()
    assert "token" not in response.text.lower()


async def test_non_admin_cannot_access_analytics() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"user"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/admin/overview")
    assert response.status_code == 403


@pytest.mark.parametrize("path", ADMIN_ENDPOINTS)
async def test_every_analytics_endpoint_requires_authentication(path: str) -> None:
    app = _app(None)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(path)
    assert response.status_code == 401


@pytest.mark.parametrize("path", ADMIN_ENDPOINTS)
async def test_every_analytics_endpoint_rejects_non_admin(path: str) -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"user"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(path)
    assert response.status_code == 403


@pytest.mark.parametrize("path", ADMIN_ENDPOINTS)
async def test_admin_can_access_every_analytics_endpoint(path: str) -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(path)
    assert response.status_code == 200


async def test_invalid_bearer_token_returns_401() -> None:
    app = _app(None)
    app.dependency_overrides[get_current_user_provider] = lambda: RejectingCurrentUserProvider()
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/admin/overview",
                headers={"Authorization": "Bearer definitely-invalid"},
            )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "path",
    (
        f"/api/v1/admin/users/{uuid4()}",
        f"/api/v1/admin/users/{uuid4()}/activity",
        f"/api/v1/admin/problems/{uuid4()}/analytics",
    ),
)
async def test_unknown_analytics_resources_return_404(path: str) -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(path)
    assert response.status_code == 404


async def test_user_detail_redacts_sensitive_data_and_keeps_unimplemented_metrics_null() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(f"/api/v1/admin/users/{TARGET_USER_ID}")
    assert response.status_code == 200
    body = response.json()
    assert [item["difficulty"] for item in body["difficulty_breakdown"]] == [
        "beginner",
        "easy",
        "medium",
        "hard",
        "expert",
    ]
    assert body["progress_summary"]["current_streak"] is None
    assert body["progress_summary"]["longest_streak"] is None
    assert body["progress_summary"]["readiness_score"] is None
    assert body["mock_test_summary"] == {
        "available": False,
        "total_attempts": 0,
        "completed_tests": 0,
        "average_score": None,
    }
    serialized = response.text.lower()
    for forbidden in ("password", "jwt", "access_token", "refresh_token", "provider_metadata"):
        assert forbidden not in serialized


def test_interview_unlock_boundary_is_exact() -> None:
    assert SqlAlchemyAdminAnalyticsRepository._unlock(99) == {
        "required_completions": 100,
        "current_completions": 99,
        "remaining_completions": 1,
        "eligible": False,
    }
    assert SqlAlchemyAdminAnalyticsRepository._unlock(100)["eligible"] is True
    assert SqlAlchemyAdminAnalyticsRepository._unlock(101)["remaining_completions"] == 0


def test_invalid_date_ranges_are_rejected() -> None:
    with pytest.raises(AppError) as error:
        AdminAnalyticsService.validate_range(NOW, NOW - timedelta(seconds=1))
    assert error.value.status == 422


async def test_sort_and_page_size_allowlists_are_enforced() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            invalid_sort = await client.get("/api/v1/admin/users?sort_by=password")
            invalid_streak_sort = await client.get("/api/v1/admin/users?sort_by=current_streak")
            invalid_page = await client.get("/api/v1/admin/problems/analytics?page_size=101")
    assert invalid_sort.status_code == 422
    assert invalid_streak_sort.status_code == 422
    assert invalid_page.status_code == 422


async def test_account_status_filter_only_accepts_active() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            active = await client.get("/api/v1/admin/users?account_status=active")
            unsupported = await client.get("/api/v1/admin/users?account_status=suspended")
    assert active.status_code == 200
    assert all(item["account_status"] == "active" for item in active.json()["items"])
    assert unsupported.status_code == 422
