"""Offline HTTP reproduction of the pre-7493e87 integer-Literal query contract."""

import asyncio
import json
from enum import IntEnum
from typing import Annotated, Literal

import httpx
from fastapi import FastAPI, Query

from recallstack.shared.errors.handlers import install_error_handlers

app = FastAPI()
install_error_handlers(app)


@app.get("/historical-growth")
async def historical(days: Annotated[Literal[7, 30, 90], Query()] = 30):
    return {"period_days": days}


class GrowthDays(IntEnum):
    WEEK = 7
    MONTH = 30
    QUARTER = 90


@app.get("/current-growth")
async def current(days: Annotated[GrowthDays, Query()] = GrowthDays.MONTH):
    return {"period_days": int(days)}


async def main():
    result = {
        "environment": "Local ASGI HTTP reproduction; not a production response",
        "historicalContract": "7493e87^",
        "requests": [],
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for path in ("/historical-growth", "/current-growth"):
            for days in (7, 30, 90):
                response = await client.get(path, params={"days": days})
                result["requests"].append(
                    {
                        "path": path,
                        "days": days,
                        "status": response.status_code,
                        "body": response.json(),
                    }
                )
    assert [r["status"] for r in result["requests"]] == [422, 422, 422, 200, 200, 200]
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
