"""Authorized Admin HTTP contracts backed by a disposable PostgreSQL database."""

from uuid import uuid4

import httpx
import pytest
from sqlalchemy import text

from recallstack.main import create_app
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from tests.conftest import TEST_PUBLISHER_PROFILE_ID
from tests.integration.test_admin_content_management import _seed_catalog

pytestmark = pytest.mark.integration


async def test_authorized_content_and_user_http_workflow(migrated_database_url):
    settings = Settings(
        supabase_project_url="https://example.supabase.co",
        app_env="test",
        database_url=migrated_database_url,
    )
    database = Database(settings)
    try:
        domain, category, _, topic, provider, _ = await _seed_catalog(database)
        target = uuid4()
        async with database.session_factory.create_session() as s, s.begin():
            await s.execute(text("INSERT INTO auth.users(id) VALUES (:id)"), {"id": target})
            await s.execute(text("INSERT INTO profiles(id) VALUES (:id)"), {"id": target})
        app = create_app(settings)
        admin = TEST_PUBLISHER_PROFILE_ID
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            admin, admin, frozenset({"admin"})
        )
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://test",
            ) as client,
        ):

            async def request(method, path, payload=None, status=200):
                r = await client.request(
                    method,
                    "/api/v1/admin" + path,
                    **({"json": payload} if payload is not None else {}),
                )
                assert r.status_code == status, r.text
                assert r.headers["cache-control"] == "private, no-store"
                return r.json()

            created = await request(
                "POST",
                "/content",
                {
                    "domain_id": str(domain),
                    "slug": f"audit-http-{uuid4().hex[:10]}",
                    "type": "problem",
                    "difficulty": "medium",
                },
                status=201,
            )
            item, version = created["content_item_id"], created["draft_version_id"]
            document = await request(
                "PUT",
                f"/content-versions/{version}/document",
                {
                    "expected_row_version": 1,
                    "title": "Admin HTTP audit problem",
                    "blocks": [{"type": "recognize", "payload": {"text": "Verified content"}}],
                    "category_ids": [str(category)],
                    "topics": [{"topic_id": str(topic), "is_primary": True}],
                },
            )
            versions = await request("GET", f"/content/{item}/versions")
            assert versions["pagination"]["total_items"] == 1
            await request(
                "PUT",
                f"/content/{item}/practice-resources",
                {
                    "expected_revision": 1,
                    "resources": [
                        {
                            "provider_id": provider,
                            "url": "https://example.test/problem",
                            "is_primary": True,
                        }
                    ],
                },
            )
            review = await request(
                "POST",
                f"/content-versions/{version}/submit-review",
                {
                    "expected_row_version": document["row_version"],
                    "reason": "Ready for review",
                },
            )
            draft = await request(
                "POST",
                f"/content-versions/{version}/return-draft",
                {
                    "expected_row_version": review["row_version"],
                    "reason": "Check content again",
                },
            )
            review = await request(
                "POST",
                f"/content-versions/{version}/submit-review",
                {
                    "expected_row_version": draft["row_version"],
                    "reason": "Reviewed again",
                },
            )
            await request(
                "POST",
                f"/content-versions/{version}/publish",
                {
                    "expected_row_version": review["row_version"],
                    "reason": "Verified local workflow",
                },
            )
            await request("POST", f"/content/{item}/versions", status=201)
            await request("POST", f"/content/{item}/archive", {"reason": "Local test complete"})
            for path in (
                "/users/legacy",
                f"/users/legacy/{target}",
                f"/users/{target}/progress",
                f"/users/{target}/practice-attempts",
                f"/users/{target}/reviews",
                f"/users/{target}/roles",
            ):
                await request("GET", path)
            roles = await request("GET", f"/users/{admin}/roles")
            role_id = next(
                r["role_id"] for r in roles["items"] if r["role_code"] == "admin" and r["active"]
            )
            grant = await request("POST", f"/users/{target}/roles", {"role_id": role_id})
            assert grant["grant"]["active"] is True
            revoke = await request("POST", f"/users/{target}/roles/{role_id}/revoke")
            assert revoke["grant"]["active"] is False
    finally:
        await database.close()
