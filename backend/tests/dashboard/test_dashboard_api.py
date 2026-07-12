from uuid import uuid4

import httpx

from recallstack.main import create_app
from recallstack.modules.catalog.application.category_dashboard import CategoryDashboardService
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings
from tests.dashboard.test_dashboard_service import FakeDashboardUow


async def test_dashboard_requires_authentication() -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/domains/dsa/categories")
    assert response.status_code == 401


async def test_dashboard_returns_domain_not_found_problem() -> None:
    subject = uuid4()
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        subject, subject, frozenset({"user"})
    )
    async with app.router.lifespan_context(app):
        app.state.category_dashboard_service = CategoryDashboardService(
            lambda: FakeDashboardUow(None, {}, {})
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/domains/missing/categories")
    assert response.status_code == 404
    assert response.json()["type"].endswith("/domain-not-found")
