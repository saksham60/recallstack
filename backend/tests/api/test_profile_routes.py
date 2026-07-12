from uuid import uuid4

import httpx

from recallstack.main import create_app
from recallstack.modules.identity.application.services import IdentityService
from recallstack.modules.identity.presentation.dependencies import (
    get_current_user,
    get_identity_service,
)
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings
from tests.fakes import FakeProfileRepository, FakeUowFactory


def _app_with_user(
    current_user: CurrentUser,
    service: IdentityService,
):
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_identity_service] = lambda: service
    return app


async def test_profile_endpoint_requires_bearer_authentication() -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/me")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["type"].endswith("/authentication-required")


async def test_profile_is_scoped_to_authenticated_subject() -> None:
    owner_id = uuid4()
    other_id = uuid4()
    repository = FakeProfileRepository()
    await repository.provision(owner_id)
    await repository.provision(other_id)
    await repository.update(
        owner_id, display_name="Owner", avatar_url=None, timezone="Asia/Kolkata"
    )
    await repository.update(other_id, display_name="Other", avatar_url=None, timezone="UTC")
    service = IdentityService(FakeUowFactory(repository))
    app = _app_with_user(CurrentUser(owner_id, owner_id, frozenset({"reviewer"})), service)

    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/me")

    assert response.status_code == 200
    assert response.json()["id"] == str(owner_id)
    assert response.json()["display_name"] == "Owner"
    assert response.json()["roles"] == ["reviewer"]


async def test_profile_patch_updates_only_authenticated_profile() -> None:
    owner_id = uuid4()
    other_id = uuid4()
    repository = FakeProfileRepository()
    await repository.provision(owner_id)
    await repository.provision(other_id)
    await repository.update(owner_id, display_name="Old", avatar_url=None, timezone="UTC")
    await repository.update(other_id, display_name="Other", avatar_url=None, timezone="UTC")
    service = IdentityService(FakeUowFactory(repository))
    app = _app_with_user(CurrentUser(owner_id, owner_id, frozenset()), service)

    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.patch("/api/v1/me", json={"display_name": "  New Name  "})

    assert response.status_code == 200
    assert response.json()["display_name"] == "New Name"
    assert repository.profiles[other_id].display_name == "Other"


async def test_profile_patch_rejects_unsafe_avatar_url() -> None:
    owner_id = uuid4()
    repository = FakeProfileRepository()
    await repository.provision(owner_id)
    app = _app_with_user(
        CurrentUser(owner_id, owner_id, frozenset()), IdentityService(FakeUowFactory(repository))
    )

    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.patch(
                "/api/v1/me", json={"avatar_url": "http://example.com/avatar.png"}
            )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
