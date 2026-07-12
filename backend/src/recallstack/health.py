import asyncio
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from recallstack.shared.database import Database

router = APIRouter(tags=["health"])


class ReadinessProbe:
    def __init__(self, database: Database, cache_seconds: float) -> None:
        self._database = database
        self._cache_seconds = cache_seconds
        self._last_check = 0.0
        self._last_result = False
        self._lock = asyncio.Lock()

    async def check(self) -> bool:
        now = time.monotonic()
        if now - self._last_check < self._cache_seconds:
            return self._last_result
        async with self._lock:
            now = time.monotonic()
            if now - self._last_check >= self._cache_seconds:
                self._last_result = await self._database.ping()
                self._last_check = now
        return self._last_result


@router.get("/health/live", operation_id="liveness")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready", operation_id="readiness")
async def readiness(request: Request) -> JSONResponse:
    ready: bool = await request.app.state.readiness_probe.check()
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ready" if ready else "not_ready"},
    )
