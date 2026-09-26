import asyncio
import json
from collections.abc import Mapping

import httpx


class ProviderError(Exception):
    """Safe category-only exception; never include remote response bodies or credentials."""


class ProviderHttp:
    def __init__(self, client: httpx.AsyncClient, *, retries: int = 2, timeout: float = 45) -> None:
        self._client, self._retries, self._timeout = client, retries, timeout

    async def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        content: bytes = b"",
        max_bytes: int = 2_097_152,
    ) -> bytes:
        for attempt in range(self._retries + 1):
            try:
                async with asyncio.timeout(self._timeout):
                    async with self._client.stream(
                        method,
                        url,
                        headers=headers,
                        content=content,
                        follow_redirects=False,
                    ) as response:
                        if response.status_code == 429 or response.status_code >= 500:
                            if attempt == self._retries:
                                raise ProviderError("provider_transient_failure")
                        elif not 200 <= response.status_code < 300:
                            raise ProviderError("provider_request_rejected")
                        else:
                            body = bytearray()
                            async for chunk in response.aiter_bytes(chunk_size=65536):
                                body.extend(chunk)
                                if len(body) > max_bytes:
                                    raise ProviderError("provider_response_too_large")
                            return bytes(body)
            except (httpx.TimeoutException, httpx.NetworkError, TimeoutError):
                if attempt == self._retries:
                    raise ProviderError("provider_timeout_or_network") from None
            await asyncio.sleep(min(2**attempt, 4))
        raise ProviderError("provider_unavailable")

    async def json(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        payload: object = None,
    ) -> object:
        body = await self.request(
            method,
            url,
            headers=headers,
            content=json.dumps(payload).encode() if payload is not None else b"",
        )
        try:
            result: object = json.loads(body)
            return result
        except ValueError:
            raise ProviderError("provider_invalid_json") from None
