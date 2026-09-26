import logging
from datetime import UTC, datetime

from pydantic import BaseModel, Field, ValidationError

from recallstack.modules.knowledge.application.concurrency import bounded_map
from recallstack.modules.knowledge.domain.entities import DiscoveryCandidate
from recallstack.modules.knowledge.infrastructure.providers.http import ProviderError, ProviderHttp

logger = logging.getLogger(__name__)


class HNItem(BaseModel):
    id: int
    type: str
    title: str = Field(default="", max_length=500)
    url: str = Field(default="", max_length=4096)
    time: int = Field(ge=0, le=253402300799)
    deleted: bool = False
    dead: bool = False


class HackerNewsDiscovery:
    name = "hacker_news"
    source_key = "hacker_news"

    def __init__(self, http: ProviderHttp, *, concurrency: int = 2) -> None:
        self._http, self._concurrency = http, concurrency

    async def discover(self, limit: int) -> tuple[DiscoveryCandidate, ...]:
        raw = await self._http.json("GET", "https://hacker-news.firebaseio.com/v0/topstories.json")
        if not isinstance(raw, list):
            raise ProviderError("hn_invalid_listing")
        ids = [item for item in raw[: min(limit, 100)] if isinstance(item, int) and item > 0]

        async def fetch(item_id: int) -> DiscoveryCandidate | None:
            try:
                data = await self._http.json(
                    "GET",
                    f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json",
                )
                item = HNItem.model_validate(data)
                if item.deleted or item.dead or item.type != "story" or not item.url:
                    return None
                return DiscoveryCandidate(
                    "hacker_news",
                    item.url,
                    item.title,
                    "",
                    datetime.fromtimestamp(item.time, UTC),
                    external_id=str(item.id),
                )
            except (ProviderError, ValidationError, OverflowError, OSError):
                logger.warning("knowledge_hn_item_failed", extra={"provider": self.name})
                return None

        return tuple(item for item in await bounded_map(ids, fetch, self._concurrency) if item)
