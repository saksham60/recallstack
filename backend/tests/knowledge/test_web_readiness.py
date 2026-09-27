from dataclasses import replace
from decimal import Decimal
from uuid import uuid4

from recallstack.modules.knowledge.domain.entities import KnowledgeSource
from tests.knowledge.fakes import FakeStore, candidate, ingestion


class MultiSourceStore(FakeStore):
    def __init__(self, sources):
        super().__init__()
        self._sources = sources

    async def sources(self):
        return self._sources


class Provider:
    def __init__(self, source_key, candidates):
        self.source_key = source_key
        self.name = source_key
        self._candidates = candidates

    async def discover(self, limit):
        return self._candidates[:limit]


async def test_ingestion_interleaves_sources_before_paid_processing():
    hacker_news = KnowledgeSource(
        uuid4(), "hacker_news", "Hacker News", "hacker_news", True, Decimal("0.95")
    )
    web = KnowledgeSource(uuid4(), "web", "Web", "web", True, Decimal("0.85"))
    hn_candidates = (
        replace(
            candidate(0),
            source_key="hacker_news",
            url="https://hn.example.com/kernel",
            title="Linux kernel scheduler adds new NUMA latency controls",
        ),
        replace(
            candidate(1),
            source_key="hacker_news",
            url="https://hn.example.com/rust",
            title="Rust compiler changes incremental build dependency tracking",
        ),
        replace(
            candidate(2),
            source_key="hacker_news",
            url="https://hn.example.com/gpu",
            title="GPU inference runtime reduces memory transfer overhead",
        ),
    )
    web_candidates = (
        replace(
            candidate(3),
            source_key="web",
            url="https://web.example.com/database",
            title="Cloud database engine introduces distributed query planning",
        ),
        replace(
            candidate(4),
            source_key="web",
            url="https://web.example.com/agents",
            title="AI agent framework adds typed tool execution boundaries",
        ),
    )
    result = await ingestion(
        store=MultiSourceStore((hacker_news, web)),
        providers=(
            Provider("hacker_news", hn_candidates),
            Provider("web", web_candidates),
        ),
    ).run(limit=4, dry_run=True, run_id="diversity")
    assert [story.source.key for story in result.previews] == [
        "hacker_news",
        "web",
        "hacker_news",
        "web",
    ]
