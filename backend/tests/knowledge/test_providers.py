import json
from datetime import UTC, datetime
from io import BytesIO

import httpx
import pytest
from PIL import Image, UnidentifiedImageError

from recallstack.modules.knowledge.infrastructure.image_processing import transform_image
from recallstack.modules.knowledge.infrastructure.providers.hacker_news import HackerNewsDiscovery
from recallstack.modules.knowledge.infrastructure.providers.http import ProviderError, ProviderHttp
from recallstack.modules.knowledge.infrastructure.providers.nemotron import NemotronProcessor
from recallstack.modules.knowledge.infrastructure.providers.r2 import R2ImageStore, sign_request
from recallstack.modules.knowledge.infrastructure.providers.tavily import TavilyDiscovery
from recallstack.modules.knowledge.infrastructure.safe_fetch import SafeFetcher, resolve_public
from tests.knowledge.fakes import candidate


async def resolver(host, port):
    return ("93.184.216.34",)


async def test_redirect_to_private_host_never_connects():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="Nonpublic"):
            await SafeFetcher(client, resolver=resolver).fetch(
                "https://example.com/image",
                max_bytes=1000,
                allowed_types=frozenset({"image/png"}),
            )
    assert len(calls) == 1
    assert calls[0].url.host == "93.184.216.34"
    assert calls[0].headers["host"] == "example.com"
    assert calls[0].extensions["sni_hostname"] == "example.com"


@pytest.mark.parametrize(
    "headers,content",
    [
        ({"content-type": "text/html"}, b"html"),
        ({"content-type": "image/png", "content-length": "1000000"}, b"abc"),
        ({"content-type": "image/png"}, b"a" * 1001),
    ],
)
async def test_download_bounds_and_mime(headers, content):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, headers=headers, content=content),
        )
    ) as client:
        with pytest.raises(ValueError):
            await SafeFetcher(client, resolver=resolver).fetch(
                "https://example.com/image",
                max_bytes=1000,
                allowed_types=frozenset({"image/png"}),
            )


async def test_dns_private_address_is_rejected(monkeypatch):
    import asyncio
    import socket

    async def fake(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443))]

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", fake)
    with pytest.raises(ValueError, match="Nonpublic DNS"):
        await resolve_public("example.com", 443)


def test_image_transforms_to_bounded_webp_and_rejects_bad_pixels():
    buffer = BytesIO()
    Image.new("RGB", (640, 480), "blue").save(buffer, format="PNG")
    result = transform_image(buffer.getvalue())
    with Image.open(BytesIO(result)) as output:
        assert output.format == "WEBP" and output.size == (1080, 1350)
    assert len(result) < 1_048_576
    with pytest.raises(UnidentifiedImageError):
        transform_image(b"not-an-image")
    tiny = BytesIO()
    Image.new("RGB", (20, 20)).save(tiny, format="PNG")
    with pytest.raises(ValueError, match="dimensions"):
        transform_image(tiny.getvalue())


async def test_tavily_normalizes_results_and_bounds_request():
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "New database engine",
                        "url": "https://example.com/news",
                        "content": "summary",
                        "published_date": "2026-09-25T10:00:00Z",
                    },
                    {"title": "invalid"},
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await TavilyDiscovery(ProviderHttp(client), "secret", ("engineering",)).discover(
            30
        )
    assert len(result) == 1 and result[0].source_key == "web"
    assert requests[0]["max_results"] == 20


async def test_hn_uses_official_api_and_isolates_bad_items():
    def handler(request):
        assert request.url.host == "hacker-news.firebaseio.com"
        if "topstories" in request.url.path:
            return httpx.Response(200, json=[1, 2, 3])
        if "1.json" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "id": 1,
                    "type": "story",
                    "title": "Rust compiler",
                    "url": "https://example.com/rust",
                    "time": 1780000000,
                },
            )
        return httpx.Response(200, json=None)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await HackerNewsDiscovery(ProviderHttp(client)).discover(10)
    assert len(result) == 1 and result[0].external_id == "1"


@pytest.mark.parametrize(
    "content",
    [
        "not json",
        '{"title":"short"}',
        json.dumps(
            {
                "title": "Good database headline",
                "summary": "A" * 60,
                "why_it_matters": "B" * 30,
                "topics": ["ai"],
                "importance_score": 1.1,
                "quality_score": 0.9,
                "bullets": [],
            }
        ),
    ],
)
async def test_model_rejects_invalid_output_without_leaking_key(content):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={"choices": [{"message": {"content": content}, "finish_reason": "stop"}]},
            )
        )
    ) as client:
        with pytest.raises(ProviderError) as error:
            await NemotronProcessor(
                ProviderHttp(client),
                key="super-secret",
                model="model",
                base_url="https://example.com/v1",
            ).process(candidate())
    assert "super-secret" not in str(error.value)


async def test_model_validates_structured_output():
    output = {
        "title": "A new database engine",
        "summary": "Technical performance summary. " * 3,
        "why_it_matters": "This reduces engineering latency.",
        "topics": ["AI Agents"],
        "importance_score": 0.9,
        "quality_score": 0.8,
        "bullets": [],
    }

    def handler(request):
        assert json.loads(request.content)["response_format"]["type"] == "json_schema"
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": json.dumps(output)}, "finish_reason": "stop"}]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await NemotronProcessor(
            ProviderHttp(client), key="secret", model="model", base_url="https://example.com/v1"
        ).process(candidate())
    assert result.topics == ("ai-agents",)


async def test_provider_timeout_is_safe():
    def handler(request):
        raise httpx.ReadTimeout("contains-secret", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderError) as error:
            await ProviderHttp(client, retries=0).json("GET", "https://example.com")
    assert "contains-secret" not in str(error.value)


def test_sigv4_matches_published_aws_s3_get_object_vector():
    signed = sign_request(
        "GET",
        "https://examplebucket.s3.amazonaws.com/test.txt",
        b"",
        access_key="AKIAIOSFODNN7EXAMPLE",
        secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        now=datetime(2013, 5, 24, tzinfo=UTC),
        headers={"range": "bytes=0-9"},
        region="us-east-1",
    )
    assert signed["Authorization"].endswith(
        "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    )


async def test_r2_upload_and_partial_batch_delete():
    requests = []

    def handler(request):
        requests.append(request)
        if request.method == "PUT":
            return httpx.Response(200)
        return httpx.Response(
            200,
            content=(
                b'<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
                b"<Deleted><Key>shorts/a.webp</Key></Deleted>"
                b"<Error><Key>shorts/b.webp</Key><Code>AccessDenied</Code></Error></DeleteResult>"
            ),
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        store = R2ImageStore(
            ProviderHttp(client),
            endpoint="https://account.r2.cloudflarestorage.com",
            bucket="shorts",
            public_base="https://cdn.example.com",
            access_key="key",
            secret_key="secret",
        )
        await store.put("shorts/a.webp", b"webp")
        deleted = await store.delete(("shorts/a.webp", "shorts/b.webp"))
    assert deleted == frozenset({"shorts/a.webp"})
    assert requests[0].headers["content-type"] == "image/webp"
    assert requests[1].headers["content-md5"]
