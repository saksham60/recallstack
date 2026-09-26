import logging

from pydantic import BaseModel, Field, ValidationError

from recallstack.modules.knowledge.application.concurrency import bounded_map
from recallstack.modules.knowledge.domain.entities import DiscoveryCandidate
from recallstack.modules.knowledge.infrastructure.enrichment import parse_date
from recallstack.modules.knowledge.infrastructure.providers.http import ProviderError, ProviderHttp

logger = logging.getLogger(__name__)


class SearchResult(BaseModel):
    url: str = Field(max_length=4096)
    title: str = Field(max_length=500)
    content: str = Field(default="", max_length=50000)
    published_date: str | None = None


class SearchResponse(BaseModel):
    results: list[object] = Field(max_length=20)


class TavilyDiscovery:
    name = "tavily"
    source_key = "web"

    def __init__(
        self,
        http: ProviderHttp,
        api_key: str,
        topics: tuple[str, ...],
        *,
        concurrency: int = 2,
    ) -> None:
        self._http, self._key, self._topics, self._concurrency = http, api_key, topics, concurrency

    async def discover(self, limit: int) -> tuple[DiscoveryCandidate, ...]:
        async def search(topic: str) -> tuple[DiscoveryCandidate, ...]:
            try:
                raw = await self._http.json(
                    "POST",
                    "https://api.tavily.com/search",
                    headers={
                        "Authorization": f"Bearer {self._key}",
                        "Content-Type": "application/json",
                    },
                    payload={
                        "query": topic,
                        "max_results": min(limit, 20),
                        "topic": "news",
                        "time_range": "week",
                        "search_depth": "basic",
                        "include_raw_content": False,
                        "include_images": False,
                    },
                )
                response = SearchResponse.model_validate(raw)
            except (ProviderError, ValidationError):
                logger.warning("knowledge_discovery_query_failed", extra={"provider": self.name})
                return ()
            candidates = []
            for item in response.results:
                try:
                    result = SearchResult.model_validate(item)
                except ValidationError:
                    continue
                candidates.append(
                    DiscoveryCandidate(
                        "web",
                        result.url,
                        result.title,
                        result.content[:16000],
                        parse_date(result.published_date),
                    )
                )
            return tuple(candidates)

        batches = await bounded_map(self._topics, search, self._concurrency)
        return tuple(candidate for batch in batches for candidate in batch)[:limit]
