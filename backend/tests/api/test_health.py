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
            compatibility_response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"] == "test-request"
    assert compatibility_response.status_code == 200


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
            compatibility_response = await client.get("/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}
    assert compatibility_response.status_code == 503


async def test_browser_preflight_allows_wildcard_origin_and_authorization_header() -> None:
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=None,
            cors_allowed_origins="*",
            _env_file=None,
        )
    )
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.options(
                "/api/v1/me",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "authorization,content-type",
                },
            )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
