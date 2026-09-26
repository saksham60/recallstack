import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

from recallstack.modules.knowledge.infrastructure.canonicalization import public_url


async def resolve_public(host: str, port: int) -> tuple[str, ...]:
    records = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    addresses = tuple(dict.fromkeys(str(record[4][0]) for record in records))
    if not addresses or any(
        not ipaddress.ip_address(address).is_global or ipaddress.ip_address(address).is_multicast
        for address in addresses
    ):
        raise ValueError("Nonpublic DNS destination")
    return addresses


@dataclass(frozen=True, slots=True)
class FetchedContent:
    url: str
    content_type: str
    body: bytes


class SafeFetcher:
    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        timeout: float = 20,
        resolver: Callable[[str, int], Awaitable[tuple[str, ...]]] = resolve_public,
    ) -> None:
        self._client, self._timeout, self._resolver = client, timeout, resolver

    async def fetch(
        self, url: str, *, max_bytes: int, allowed_types: frozenset[str]
    ) -> FetchedContent:
        async with asyncio.timeout(self._timeout):
            for _ in range(4):
                public_url(url)
                parsed = urlsplit(url)
                hostname = (parsed.hostname or "").encode("idna").decode()
                port = parsed.port or (443 if parsed.scheme == "https" else 80)
                addresses = await self._resolver(hostname, port)
                # Pin the vetted address to prevent a second DNS lookup/rebinding at connect time.
                pinned = httpx.URL(url).copy_with(host=addresses[0])
                async with self._client.stream(
                    "GET",
                    pinned,
                    headers={
                        "Host": httpx.URL(url).netloc.decode(),
                        "Connection": "close",
                        "Accept-Encoding": "identity",
                        "User-Agent": "RecallStackKnowledge/1.0",
                    },
                    extensions={"sni_hostname": hostname},
                    follow_redirects=False,
                ) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            raise ValueError("Redirect lacks destination")
                        url = urljoin(url, location)
                        continue
                    if response.status_code != 200:
                        raise ValueError("Source download failed")
                    content_type = response.headers.get("content-type", "").split(";")[0].lower()
                    if content_type not in allowed_types:
                        raise ValueError("Unsupported content type")
                    if response.headers.get("content-encoding", "identity") != "identity":
                        raise ValueError("Compressed HTTP payloads are not accepted")
                    if int(response.headers.get("content-length", "0")) > max_bytes:
                        raise ValueError("Download exceeds byte limit")
                    data = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        data.extend(chunk)
                        if len(data) > max_bytes:
                            raise ValueError("Download exceeds byte limit")
                    return FetchedContent(url, content_type, bytes(data))
        raise ValueError("Too many redirects")
