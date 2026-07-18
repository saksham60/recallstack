from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from fastapi import FastAPI

from recallstack.main import create_app
from recallstack.modules.admin.application.user_inspection import (
    AdminUserSummary,
    Page,
    RoleGrantSummary,
    RoleMutationResult,
)
from recallstack.modules.admin.presentation.user_routes import get_admin_user_service
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings


class StubAdminUserService:
    def __init__(self, user_id: UUID) -> None:
        self.user_id = user_id
        self.role_id = 2

    def _user(self) -> AdminUserSummary:
        now = datetime.now(UTC)
        return AdminUserSummary(self.user_id, "Visible name", now, now, ("user",), 4, 2, 1, now)

    async def list_users(self, **kwargs: object) -> Page[AdminUserSummary]:
        del kwargs
        return Page((self._user(),), 1, 25, 1)

    async def get_user(self, user_id: UUID) -> AdminUserSummary:
        assert user_id == self.user_id
        return self._user()

    async def list_progress(self, **kwargs: object) -> Page[object]:
        del kwargs
        return Page((), 1, 25, 0)

    async def list_practice_attempts(self, **kwargs: object) -> Page[object]:
        del kwargs
        return Page((), 1, 25, 0)

    async def list_reviews(self, **kwargs: object) -> Page[object]:
        del kwargs
        return Page((), 1, 25, 0)

    async def list_roles(self, **kwargs: object) -> Page[RoleGrantSummary]:
        del kwargs
        return Page((self._grant(),), 1, 25, 1)

    async def grant_role(self, **kwargs: object) -> RoleMutationResult:
        del kwargs
        return RoleMutationResult(self._grant(), True)

    async def revoke_role(self, **kwargs: object) -> RoleMutationResult:
        del kwargs
        grant = self._grant(revoked=True)
        return RoleMutationResult(grant, True)

    def _grant(self, *, revoked: bool = False) -> RoleGrantSummary:
        now = datetime.now(UTC)
        return RoleGrantSummary(
            10,
            self.role_id,
            "admin",
            "Administrator",
            now,
            self.user_id,
            now if revoked else None,
            self.user_id if revoked else None,
        )


def _app(user: CurrentUser, target_id: UUID) -> FastAPI:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_admin_user_service] = lambda: StubAdminUserService(target_id)
    return app


async def test_normal_user_is_denied_admin_user_inspection() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"user"})), uuid4())
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/admin/users")
    assert response.status_code == 403


async def test_admin_can_list_users_with_pagination_and_redacted_fields() -> None:
    profile_id = uuid4()
    target_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})), target_id)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/admin/users?page=1&page_size=25")
    assert response.status_code == 200
    body = response.json()
    assert body["pagination"]["total_items"] == 1
    assert body["items"][0]["id"] == str(target_id)
    serialized = response.text.lower()
    for sensitive_name in ("auth_subject", "email", "token", "avatar_url", "timezone"):
        assert sensitive_name not in serialized


async def test_admin_can_grant_and_revoke_role() -> None:
    profile_id = uuid4()
    target_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})), target_id)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            granted = await client.post(
                f"/api/v1/admin/users/{target_id}/roles", json={"role_id": 2}
            )
            revoked = await client.post(f"/api/v1/admin/users/{target_id}/roles/2/revoke")
    assert granted.status_code == 200
    assert granted.json()["grant"]["active"] is True
    assert revoked.status_code == 200
    assert revoked.json()["grant"]["active"] is False


async def test_admin_user_filters_are_validated() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})), uuid4())
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            invalid_status = await client.get("/api/v1/admin/users?progress_status=invalid")
            invalid_page_size = await client.get("/api/v1/admin/users?page_size=101")
    assert invalid_status.status_code == 422
    assert invalid_page_size.status_code == 422
