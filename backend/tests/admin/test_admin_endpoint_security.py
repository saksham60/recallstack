"""Every registered Admin endpoint rejects unsigned and non-admin callers."""

from uuid import uuid4

import httpx
import pytest

from recallstack.main import create_app
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings

APP = create_app(
    Settings(supabase_project_url="https://example.supabase.co", app_env="test", database_url=None)
)
ENDPOINTS = [
    (method.upper(), path)
    for path, spec in APP.openapi()["paths"].items()
    if path.startswith("/api/v1/admin/")
    for method in spec
    if method in {"get", "post", "put", "patch", "delete"}
]
ENDPOINTS += [("GET", "/api/v1/admin/users/legacy"), ("GET", "/api/v1/admin/users/legacy/{userId}")]


@pytest.mark.parametrize("method,path", ENDPOINTS)
@pytest.mark.parametrize("authenticated", (False, True))
async def test_all_admin_operations_enforce_server_authorization(method, path, authenticated):
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co", app_env="test", database_url=None
        )
    )
    if authenticated:
        user = uuid4()
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            user, user, frozenset({"user"})
        )
    for name in ("userId", "contentId", "versionId", "problemId"):
        path = path.replace("{" + name + "}", str(uuid4()))
    path = path.replace("{roleId}", "1")
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.request(
                method, path, **({"json": {}} if method != "GET" else {})
            )
    assert response.status_code == (403 if authenticated else 401), response.text
    assert response.headers["cache-control"] == "private, no-store"
    assert "Authorization" in response.headers["vary"]
