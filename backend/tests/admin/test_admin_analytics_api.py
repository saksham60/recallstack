from datetime import UTC, datetime
from uuid import uuid4

import httpx
from fastapi import FastAPI

from recallstack.main import create_app
from recallstack.modules.admin.infrastructure.analytics_repository import (
    SqlAlchemyAdminAnalyticsRepository,
)
from recallstack.modules.admin.presentation.analytics_routes import (
    get_admin_analytics_service,
)
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings


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


def _app(user: CurrentUser) -> FastAPI:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_admin_analytics_service] = lambda: StubAnalyticsService()
    return app


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


def test_interview_unlock_boundary_is_exact() -> None:
    assert SqlAlchemyAdminAnalyticsRepository._unlock(99) == {
        "required_completions": 100,
        "current_completions": 99,
        "remaining_completions": 1,
        "eligible": False,
    }
    assert SqlAlchemyAdminAnalyticsRepository._unlock(100)["eligible"] is True
    assert SqlAlchemyAdminAnalyticsRepository._unlock(101)["remaining_completions"] == 0


async def test_sort_and_page_size_allowlists_are_enforced() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            invalid_sort = await client.get("/api/v1/admin/users?sort_by=password")
            invalid_page = await client.get("/api/v1/admin/problems/analytics?page_size=101")
    assert invalid_sort.status_code == 422
    assert invalid_page.status_code == 422
