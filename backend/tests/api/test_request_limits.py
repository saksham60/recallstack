import httpx

from recallstack.main import create_app
from recallstack.shared.config import Settings


async def test_oversized_request_is_rejected_before_route_processing() -> None:
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            request_body_max_bytes=1024,
        )
    )
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.patch(
                "/api/v1/me", content=b"x" * 1025, headers={"content-type": "application/json"}
            )

    assert response.status_code == 413
    assert response.json()["type"].endswith("/request-too-large")
