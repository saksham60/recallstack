"""Loopback-only fixture server for real PostgreSQL → Admin browser checks.

Uses disposable test identities and a test dependency override. Never deploy.
No environment database URL or production credentials are read.
"""

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from testcontainers.postgres import PostgresContainer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from recallstack.modules.admin.presentation.middleware import AdminCacheMiddleware
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.modules.telemetry.middleware import TelemetryHealthMiddleware
from recallstack.modules.telemetry.routes import router
from recallstack.shared.auth import CurrentUser
from recallstack.shared.database.event_loop import configure_psycopg_event_loop
from recallstack.shared.errors.handlers import install_error_handlers
from recallstack.shared.observability.middleware import RequestContextMiddleware
from tests.integration.test_product_intelligence import telemetry_db

USER = UUID("00000000-0000-4000-8000-000000000001")


def main() -> None:
    configure_psycopg_event_loop()
    with PostgresContainer("postgres:17.6-bookworm", driver="psycopg") as pg:
        fixture = telemetry_db.__wrapped__(pg.get_connection_url())
        url = next(fixture)
        engine = create_engine(url)
        with engine.begin() as c:
            c.execute(
                text(
                    "INSERT INTO profiles(id,display_name,email) "
                    "VALUES(:id,'Fixture learner','fixture@example.test')"
                ),
                {"id": USER},
            )
        engine.dispose()
        async_engine = create_async_engine(url)

        @asynccontextmanager
        async def lifespan(app):
            yield
            await async_engine.dispose()

        app = FastAPI(lifespan=lifespan)
        app.state.telemetry_session_factory = SimpleNamespace(
            create_session=lambda: AsyncSession(async_engine)
        )
        app.state.telemetry_environment = "test"
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            USER, USER, frozenset({"admin"})
        )
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:3000"],
            allow_methods=["*"],
            allow_headers=["*"],
        )
        app.add_middleware(RequestContextMiddleware)
        app.add_middleware(AdminCacheMiddleware)
        app.add_middleware(TelemetryHealthMiddleware)
        install_error_handlers(app)
        app.include_router(router, prefix="/api/v1")

        @app.get("/test-health")
        def health():
            return {"fixture": True}

        try:
            server = uvicorn.Server(
                uvicorn.Config(app, host="127.0.0.1", port=4170, log_level="warning")
            )
            asyncio.run(server.serve(), loop_factory=asyncio.SelectorEventLoop)
        finally:
            try:
                next(fixture)
            except StopIteration:
                pass


if __name__ == "__main__":
    main()
