import httpx

from recallstack.main import create_app
from recallstack.shared.config import Settings


async def test_liveness_is_independent_of_database() -> None:
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=None,
            _env_file=None,
        )
    )
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/health/live", headers={"X-Request-ID": "test-request"})

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"] == "test-request"


async def test_readiness_fails_when_database_is_not_configured() -> None:
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=None,
            _env_file=None,
        )
    )
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}
