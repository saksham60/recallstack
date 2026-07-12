import logging
import re
import time
from collections.abc import MutableMapping
from typing import Any
from uuid import uuid4

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from recallstack.shared.observability.context import (
    profile_id_context,
    request_id_context,
    trace_id_context,
)

logger = logging.getLogger("recallstack.http")
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_TRACEPARENT = re.compile(r"^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$")


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        supplied_id = headers.get("x-request-id", "")
        request_id = supplied_id if _REQUEST_ID.fullmatch(supplied_id) else str(uuid4())
        trace_match = _TRACEPARENT.fullmatch(headers.get("traceparent", ""))
        trace_id = trace_match.group(1) if trace_match else None
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        state["trace_id"] = trace_id
        request_id_token = request_id_context.set(request_id)
        trace_id_token = trace_id_context.set(trace_id)
        profile_id_token = profile_id_context.set(None)
        started = time.perf_counter()
        status = 500

        async def send_with_context(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_context)
        finally:
            route = scope.get("route")
            route_name = getattr(route, "name", None) or scope.get("path")
            logger.info(
                "request_completed",
                extra={
                    "request_id": request_id,
                    "trace_id": trace_id,
                    "profile_id": profile_id_context.get(),
                    "method": scope.get("method"),
                    "route": route_name,
                    "status": status,
                    "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            profile_id_context.reset(profile_id_token)
            trace_id_context.reset(trace_id_token)
            request_id_context.reset(request_id_token)


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        content_length = headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > self.max_bytes:
            await self._reject(scope, receive, send)
            return
        consumed = 0

        async def limited_receive() -> Message:
            nonlocal consumed
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > self.max_bytes:
                    raise _BodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await self._reject(scope, receive, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        request_id = scope.get("state", {}).get("request_id", "unknown")
        body = json_bytes(
            {
                "type": "https://recallstack.dev/problems/request-too-large",
                "title": "Request body too large",
                "status": 413,
                "detail": f"Request body exceeds {self.max_bytes} bytes",
                "instance": scope.get("path", ""),
                "request_id": request_id,
            }
        )
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/problem+json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


class _BodyTooLarge(Exception):
    pass


def json_bytes(value: MutableMapping[str, Any]) -> bytes:
    import json

    return json.dumps(value, separators=(",", ":")).encode()
