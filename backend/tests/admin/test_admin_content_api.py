from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx

from recallstack.main import create_app
from recallstack.modules.admin.application.content_management import (
    CreatedContent,
    PublishedVersion,
)
from recallstack.modules.admin.presentation.routes import get_admin_content_service
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings


class StubAdminContentService:
    async def create_content(self, *, actor_id: UUID, command: object) -> CreatedContent:
        del command
        return CreatedContent(
            uuid4(),
            uuid4(),
            uuid4(),
            "maximum-subarray",
            "problem",
            "medium",
            1,
            "draft",
        )

    async def publish(
        self,
        *,
        version_id: UUID,
        actor_id: UUID,
        expected_row_version: int,
        reason: str,
    ) -> PublishedVersion:
        del expected_row_version, reason
        return PublishedVersion(
            uuid4(),
            version_id,
            1,
            "published",
            4,
            datetime.now(UTC),
            actor_id,
            actor_id,
        )


def _app(user: CurrentUser):
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_admin_content_service] = lambda: StubAdminContentService()
    return app


async def test_normal_user_cannot_create_admin_content() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"user"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/admin/content",
                json={
                    "domain_id": str(uuid4()),
                    "slug": "maximum-subarray",
                    "type": "problem",
                    "difficulty": "medium",
                },
            )
    assert response.status_code == 403


async def test_content_editor_can_create_content_and_slug_is_normalized() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"content_editor"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/admin/content",
                json={
                    "domain_id": str(uuid4()),
                    "slug": "  Maximum-Subarray  ",
                    "type": "problem",
                    "difficulty": "medium",
                },
            )
    assert response.status_code == 201
    assert response.json()["slug"] == "maximum-subarray"
    assert response.json()["version_status"] == "draft"


async def test_content_editor_cannot_publish_but_admin_can() -> None:
    profile_id = uuid4()
    version_id = uuid4()
    payload = {"expected_row_version": 3, "reason": "Approved"}
    editor_app = _app(CurrentUser(profile_id, profile_id, frozenset({"content_editor"})))
    async with editor_app.router.lifespan_context(editor_app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=editor_app), base_url="http://test"
        ) as client:
            denied = await client.post(
                f"/api/v1/admin/content-versions/{version_id}/publish", json=payload
            )
    admin_app = _app(CurrentUser(profile_id, profile_id, frozenset({"admin"})))
    async with admin_app.router.lifespan_context(admin_app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=admin_app), base_url="http://test"
        ) as client:
            accepted = await client.post(
                f"/api/v1/admin/content-versions/{version_id}/publish", json=payload
            )
    assert denied.status_code == 403
    assert accepted.status_code == 200
    assert accepted.json()["published_by"] == str(profile_id)


async def test_practice_provider_contract_uses_positive_integer() -> None:
    profile_id = uuid4()
    app = _app(CurrentUser(profile_id, profile_id, frozenset({"content_editor"})))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.put(
                f"/api/v1/admin/content/{uuid4()}/practice-resources",
                json={
                    "expected_revision": 1,
                    "resources": [
                        {
                            "provider_id": str(uuid4()),
                            "url": "https://leetcode.com/problems/maximum-subarray/",
                            "sort_order": 0,
                        }
                    ],
                },
            )
    assert response.status_code == 422
