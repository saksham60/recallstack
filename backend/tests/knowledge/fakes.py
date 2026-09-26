from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from recallstack.modules.knowledge.domain.entities import (
    DiscoveryCandidate,
    ExpiredStory,
    KnowledgeSource,
    KnowledgeStory,
    ProcessedContent,
    StoryIdentity,
)
from recallstack.modules.knowledge.infrastructure.canonicalization import (
    canonical_hash,
    canonicalize,
)

SOURCE = KnowledgeSource(uuid4(), "web", "Web", "web", True, Decimal("1"))


def candidate(index=0):
    return DiscoveryCandidate(
        "web",
        f"https://engineering.example.com/article/{index}",
        f"Database performance engineering release number {index}",
        "Technical software database performance analysis. " * 10,
        datetime.now(UTC) - timedelta(hours=1),
        "https://images.example.com/article.png",
    )


def story(index=0, **changes):
    item = candidate(index)
    return replace(
        KnowledgeStory(
            uuid4(),
            SOURCE,
            item.url,
            canonical_hash(item.url),
            item.title,
            item.content,
            "This improves database query latency for software engineers.",
            f"https://cdn.example.com/shorts/{index}.webp",
            f"shorts/{index}.webp",
            item.published_at,
            datetime.now(UTC),
            Decimal("0.8"),
            Decimal("0.9"),
            ("databases",),
        ),
        **changes,
    )


class FakeStore:
    def __init__(self, stories=()):
        self.stories = {s.canonical_hash: s for s in stories}
        self.persist_calls = 0
        self.remove_calls = 0
        self.fail_persist = False
        self.preferences = {"preserved": True}

    async def sources(self):
        return (SOURCE,)

    async def identities(self, after, limit):
        return tuple(
            (s.id, StoryIdentity(s.canonical_hash, s.title, s.canonical_url, s.published_at))
            for s in sorted(self.stories.values(), key=lambda x: x.id)
            if after is None or s.id > after
        )[:limit]

    async def contains(self, digest):
        return digest in self.stories

    async def persist(self, item):
        self.persist_calls += 1
        if self.fail_persist:
            raise RuntimeError("simulated write failure")
        if item.canonical_hash in self.stories:
            return False
        self.stories[item.canonical_hash] = item
        return True

    async def expired(self, cutoff, after, limit):
        return tuple(
            ExpiredStory(s.id, s.image_key, s.published_at)
            for s in sorted(self.stories.values(), key=lambda s: (s.published_at, s.id))
            if s.published_at < cutoff and (after is None or (s.published_at, s.id) > after)
        )[:limit]

    async def remove_expired(self, ids, cutoff):
        self.remove_calls += 1
        removed = [
            s.canonical_hash
            for s in self.stories.values()
            if s.id in ids and s.published_at < cutoff
        ]
        for key in removed:
            del self.stories[key]
        return len(removed)


class FakeImages:
    def __init__(self):
        self.uploads = []
        self.deletes = []
        self.fail_delete = False

    def public_url(self, key):
        return f"https://cdn.example.com/{key}"

    async def put(self, key, content):
        self.uploads.append(key)

    async def delete(self, keys):
        self.deletes.extend(keys)
        if self.fail_delete:
            raise RuntimeError("storage offline")
        return frozenset(keys)


class FakeProvider:
    name = "fake"
    source_key = "web"

    def __init__(self, candidates=None, fail=False):
        self.candidates = candidates if candidates is not None else (candidate(),)
        self.fail = fail

    async def discover(self, limit):
        if self.fail:
            raise TimeoutError("discovery timeout")
        return self.candidates[:limit]


class FakeEnricher:
    async def enrich(self, candidate):
        return candidate


class FakeProcessor:
    async def process(self, candidate):
        return ProcessedContent(
            candidate.title,
            candidate.content,
            "Important for database performance.",
            ("databases",),
            Decimal("0.8"),
            Decimal("0.9"),
        )


class FakeImageProcessor:
    async def process(self, url):
        return b"processed-webp"


def ingestion(store=None, images=None, **kwargs):
    from recallstack.modules.knowledge.application.ingestion import IngestionService
    from recallstack.modules.knowledge.infrastructure.dedupe import similar

    return IngestionService(
        store=store or FakeStore(),
        images=images or FakeImages(),
        providers=kwargs.pop("providers", (FakeProvider(),)),
        enricher=kwargs.pop("enricher", FakeEnricher()),
        processor=kwargs.pop("processor", FakeProcessor()),
        image_processor=kwargs.pop("image_processor", FakeImageProcessor()),
        canonicalize=canonicalize,
        digest=canonical_hash,
        similar=similar,
        **kwargs,
    )
