"""Payload limits and sanitized ingestion diagnostics; never log request bodies."""

import logging

from sqlalchemy import text
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)


class TelemetryHealthMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") != "/api/v1/telemetry/events":
            await self.app(scope, receive, send)
            return
        # Buffer only this small endpoint before JSON validation.
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > 65536:
                logger.warning("telemetry_batch_rejected", extra={"status": 413})
                await JSONResponse({"detail": "Telemetry batch exceeds 64 KiB"}, 413)(
                    scope, receive, send
                )
                return
            if not message.get("more_body", False):
                break

        async def buffered() -> Message:
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        status = 500

        async def capture(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, buffered, capture)
        finally:
            if status >= 400:
                logger.warning("telemetry_batch_rejected", extra={"status": status})
                factory = getattr(scope["app"].state, "telemetry_session_factory", None)
                if factory and status not in (401, 403):
                    session = factory.create_session()
                    try:
                        await session.execute(
                            text("""
                          INSERT INTO telemetry_private.ingestion_health(day,rejected,failed)
                          VALUES ((now() AT TIME ZONE 'UTC')::date,1,:failed)
                          ON CONFLICT(day) DO UPDATE SET
                            rejected=telemetry_private.ingestion_health.rejected+1,
                            failed=telemetry_private.ingestion_health.failed+excluded.failed
                        """),
                            {"failed": int(status >= 500)},
                        )
                        await session.commit()
                    except Exception:
                        logger.warning("telemetry_health_write_failed")
                    finally:
                        await session.close()
