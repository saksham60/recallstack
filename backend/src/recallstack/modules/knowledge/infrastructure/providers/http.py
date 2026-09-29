import asyncio
import json
from collections.abc import Mapping
from contextlib import nullcontext

import httpx

from recallstack.shared.observability.langsmith import json_input, model_output, safe, span


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
            llm = url.endswith("/chat/completions")
            tavily = url == "https://api.tavily.com/search"
            hn = url.startswith("https://hacker-news.firebaseio.com/v0/")
            name = (
                "nebius.chat.completions"
                if llm
                else "tavily.search"
                if tavily
                else "hacker_news.fetch"
            )
            payload = json_input(content) if llm or tavily else {}
            try:
                context = (
                    span(
                        name,
                        "llm" if llm else "tool",
                        {"request": payload if llm or tavily else {"url": url}},
                        {"attempt": attempt + 1, "model": payload.get("model") if llm else None},
                    )
                    if llm or tavily or hn
                    else nullcontext(None)
                )
                with context as run:
                    async with asyncio.timeout(self._timeout):
                        async with self._client.stream(
                            method,
                            url,
                            headers=headers,
                            content=content,
                            follow_redirects=False,
                        ) as response:
                            if response.status_code == 429 or response.status_code >= 500:
                                if run:
                                    run.end(
                                        outputs={
                                            "status": "retry",
                                            "http_status": response.status_code,
                                        }
                                    )
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
                                result = bytes(body)
                                if run:
                                    if llm:
                                        run.end(outputs=model_output(json_input(result)))
                                    elif tavily:
                                        data = json_input(result)
                                        items = (
                                            data.get("results", [])
                                            if isinstance(data, dict)
                                            else []
                                        )
                                        run.end(
                                            outputs={
                                                "results": safe(items[:20], max_string=2400)
                                                if isinstance(items, list)
                                                else []
                                            }
                                        )
                                    else:
                                        run.end(outputs={"bytes": len(result)})
                                return result
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
