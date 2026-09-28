"""Invoke and observe the configured Cloud Run Job with the API service identity."""

import asyncio
import time

import httpx

from recallstack.modules.knowledge.application.refresh import RefreshStatus

_METADATA_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
)


class CloudRunRefreshRunner:
    def __init__(self, client: httpx.AsyncClient, project: str, region: str, job: str) -> None:
        self._client = client
        self._job = f"projects/{project}/locations/{region}/jobs/{job}"
        self._operation_prefix = f"projects/{project}/locations/{region}/operations/"
        self._token = ""
        self._token_expires = 0.0
        self._token_lock = asyncio.Lock()

    async def _access_token(self) -> str:
        if self._token and time.monotonic() < self._token_expires:
            return self._token
        async with self._token_lock:
            if self._token and time.monotonic() < self._token_expires:
                return self._token
            response = await self._client.get(_METADATA_URL, headers={"Metadata-Flavor": "Google"})
            response.raise_for_status()
            data = response.json()
            token = data.get("access_token")
            if not isinstance(token, str) or not token:
                raise ValueError("Cloud Run metadata token unavailable")
            self._token = token
            self._token_expires = time.monotonic() + max(0, int(data.get("expires_in", 0)) - 60)
            return token

    async def _request(self, method: str, resource: str) -> dict[str, object]:
        token = await self._access_token()
        response = await self._client.request(
            method,
            f"https://run.googleapis.com/v2/{resource}",
            headers={"Authorization": f"Bearer {token}"},
            json={} if method == "POST" else None,
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Invalid Cloud Run response")
        return data

    async def start(self) -> str:
        data = await self._request("POST", f"{self._job}:run")
        name = data.get("name")
        if (
            not isinstance(name, str)
            or not name.startswith(self._operation_prefix)
            or not name[len(self._operation_prefix) :]
            or "/" in name[len(self._operation_prefix) :]
        ):
            raise ValueError("Cloud Run did not return a job operation")
        return name

    async def status(self, operation_name: str) -> RefreshStatus:
        if (
            not operation_name.startswith(self._operation_prefix)
            or not operation_name[len(self._operation_prefix) :]
            or "/" in operation_name[len(self._operation_prefix) :]
        ):
            raise ValueError("Invalid job operation")
        data = await self._request("GET", operation_name)
        if not data.get("done"):
            return "running"
        return "failed" if data.get("error") else "succeeded"
