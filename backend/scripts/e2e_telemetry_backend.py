"""Loopback-only fixture server for real PostgreSQL → Admin browser checks.

Uses disposable test identities and a test dependency override. Never deploy.
No environment database URL or production credentials are read.
"""

import asyncio
import base64
import hashlib
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlencode
from uuid import UUID, uuid4

import jwt
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, Response
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
        # Loopback-only OAuth transport fixture. The real Supabase SDK performs
        # PKCE, callback exchange, cookie restoration and subsequent logins.
        codes: dict[str, dict] = {}
        sessions: dict[str, dict] = {}

        def fixture_user(request: Request):
            token = request.headers.get("authorization", "").removeprefix("Bearer ")
            identity = sessions.get(token)
            owner = UUID(identity["user"]["id"]) if identity else USER
            return CurrentUser(owner, owner, frozenset({"admin"}))

        app.dependency_overrides[get_current_user] = fixture_user
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

        @app.get("/auth/v1/authorize")
        def authorize(provider: str, redirect_to: str, code_challenge: str):
            if provider != "google" or redirect_to != "http://localhost:3000/auth/callback":
                raise HTTPException(400)
            code = uuid4().hex
            codes[code] = {"redirect": redirect_to, "challenge": code_challenge}
            return RedirectResponse("/test-google-consent?" + urlencode({"code": code}))

        @app.get("/test-google-consent", response_class=HTMLResponse)
        def consent(code: str):
            if code not in codes:
                raise HTTPException(400)
            return (
                "<h1>Fixture Google consent</h1>"
                f'<a href="/test-google-complete?code={code}">Complete signup</a>'
            )

        @app.get("/test-google-complete")
        def complete(code: str, account: UUID | None = None):
            if code not in codes:
                raise HTTPException(400)
            codes[code]["account"] = account
            return RedirectResponse(codes[code]["redirect"] + "?" + urlencode({"code": code}))

        @app.post("/auth/v1/token")
        async def exchange(request: Request):
            body = await request.json()
            flow = codes.pop(body.get("auth_code"), None)
            verifier = body.get("code_verifier", "")
            challenge = (
                base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
                .rstrip(b"=")
                .decode()
            )
            if not flow or not verifier or challenge != flow["challenge"]:
                raise HTTPException(400, "Fixture PKCE verification failed")
            owner = flow.get("account") or uuid4()
            async with async_engine.begin() as c:
                await c.execute(
                    text(
                        "INSERT INTO profiles(id,display_name,email) "
                        "VALUES(:id,'Acquisition learner','acquisition@example.test') "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {"id": owner},
                )
                created = await c.scalar(
                    text("SELECT created_at FROM profiles WHERE id=:id"), {"id": owner}
                )
            now = datetime.now(UTC)
            user = {
                "id": str(owner),
                "aud": "authenticated",
                "role": "authenticated",
                "email": "acquisition@example.test",
                "created_at": created.isoformat(),
                "last_sign_in_at": now.isoformat(),
                "app_metadata": {"provider": "google", "providers": ["google"]},
                "user_metadata": {},
            }
            token = jwt.encode(
                {
                    "sub": str(owner),
                    "aud": "authenticated",
                    "role": "authenticated",
                    "exp": now + timedelta(hours=1),
                },
                "loopback-fixture-only-signing-key-32-bytes",
                algorithm="HS256",
            )
            result = {
                "access_token": token,
                "refresh_token": uuid4().hex,
                "token_type": "bearer",
                "expires_in": 3600,
                "expires_at": int(now.timestamp()) + 3600,
                "user": user,
            }
            sessions[token] = result
            return result

        @app.get("/auth/v1/user")
        def auth_user(request: Request):
            token = request.headers.get("authorization", "").removeprefix("Bearer ")
            if token not in sessions:
                raise HTTPException(401)
            return sessions[token]["user"]

        @app.post("/auth/v1/logout")
        def logout():
            return Response(status_code=204)

        @app.get("/test-acquisition/{user_id}")
        async def acquisition_state(user_id: UUID):
            async with async_engine.connect() as c:
                source = await c.scalar(
                    text(
                        "SELECT properties FROM telemetry_private.user_acquisition "
                        "WHERE user_id=:id"
                    ),
                    {"id": user_id},
                )
                events = await c.scalar(
                    text(
                        "SELECT count(*) FROM telemetry_private.product_events "
                        "WHERE user_id=:id AND event_name='acquisition.first_touch'"
                    ),
                    {"id": user_id},
                )
            return {"properties": source, "events": events}

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
