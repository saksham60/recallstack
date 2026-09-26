from dataclasses import replace
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urljoin

from recallstack.modules.knowledge.domain.entities import DiscoveryCandidate
from recallstack.modules.knowledge.infrastructure.safe_fetch import SafeFetcher


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        try:
            result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            result = parsedate_to_datetime(value)
        return result.astimezone(UTC) if result.tzinfo else result.replace(tzinfo=UTC)
    except (ValueError, TypeError, OverflowError):
        return None


class ArticleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.image: str | None = None
        self.published: datetime | None = None
        self.parts: list[str] = []
        self._skip = 0
        self._size = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip += 1
        if tag == "meta":
            values = dict(attrs)
            key = values.get("property") or values.get("name")
            content = values.get("content")
            if key in {"og:image", "twitter:image"} and content and not self.image:
                self.image = content
            if key in {"article:published_time", "datePublished", "date"} and not self.published:
                self.published = parse_date(content)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip = max(0, self._skip - 1)

    def handle_data(self, data: str) -> None:
        if not self._skip and self._size < 16000:
            text = " ".join(data.split())[: 16000 - self._size]
            self.parts.append(text)
            self._size += len(text)


class ArticleEnricher:
    def __init__(self, fetcher: SafeFetcher) -> None:
        self._fetcher = fetcher

    async def enrich(self, candidate: DiscoveryCandidate) -> DiscoveryCandidate:
        if candidate.image_url and candidate.published_at and len(candidate.content) >= 200:
            return candidate
        page = await self._fetcher.fetch(
            candidate.url,
            max_bytes=1_048_576,
            allowed_types=frozenset({"text/html", "application/xhtml+xml"}),
        )
        parser = ArticleParser()
        parser.feed(page.body.decode("utf-8", errors="replace"))
        return replace(
            candidate,
            content=(candidate.content + "\n" + " ".join(parser.parts))[:16000],
            published_at=candidate.published_at or parser.published,
            image_url=candidate.image_url
            or (urljoin(page.url, parser.image) if parser.image else None),
        )
