import asyncio
import logging
import re
import time
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass, replace
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

from recallstack.modules.knowledge.application.concurrency import bounded_map
from recallstack.modules.knowledge.application.ports import (
    CandidateEnricher,
    ImageProcessor,
    ImageStore,
    StoryDiscoveryProvider,
    StoryProcessor,
    StoryStore,
)
from recallstack.modules.knowledge.domain.entities import (
    RETENTION,
    DiscoveryCandidate,
    KnowledgeSource,
    KnowledgeStory,
    StoryIdentity,
)

logger = logging.getLogger(__name__)
TECHNICAL = re.compile(
    r"\b(api|software|engineer\w*|architect\w*|database|sql|cloud|linux|python|rust|java|"
    r"kubernetes|compiler|distributed|llm|ai|gpu|agent\w*|security|programming|latency|"
    r"inference|model|network|storage|server|algorithm|developer\w*)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class IngestionResult:
    counts: dict[str, int]
    previews: tuple[KnowledgeStory, ...]


class IngestionService:
    def __init__(
        self,
        *,
        store: StoryStore,
        images: ImageStore,
        providers: tuple[StoryDiscoveryProvider, ...],
        enricher: CandidateEnricher,
        processor: StoryProcessor,
        image_processor: ImageProcessor,
        canonicalize: Callable[[str], str],
        digest: Callable[[str], str],
        similar: Callable[[StoryIdentity, StoryIdentity], bool],
        discovery_concurrency: int = 2,
        enrichment_concurrency: int = 4,
        model_concurrency: int = 2,
        image_concurrency: int = 2,
        r2_concurrency: int = 2,
    ) -> None:
        self._store, self._images, self._providers = store, images, providers
        self._enricher, self._processor, self._image_processor = (
            enricher,
            processor,
            image_processor,
        )
        self._canonicalize, self._digest, self._similar = canonicalize, digest, similar
        self._discovery_concurrency = discovery_concurrency
        self._enrichment_concurrency = enrichment_concurrency
        self._model_slots = asyncio.Semaphore(model_concurrency)
        self._image_slots = asyncio.Semaphore(image_concurrency)
        self._r2_slots = asyncio.Semaphore(r2_concurrency)
        self._workers = model_concurrency + image_concurrency + r2_concurrency

    async def run(self, *, limit: int, dry_run: bool, run_id: str) -> IngestionResult:
        if not 1 <= limit <= 100:
            raise ValueError("Job limit must be 1-100")
        started, now = time.perf_counter(), datetime.now(UTC)
        counts: Counter[str] = Counter()
        sources = {source.key: source for source in await self._store.sources() if source.enabled}
        providers = tuple(
            provider for provider in self._providers if provider.source_key in sources
        )
        if not providers:
            logger.error(
                "knowledge_source_registry_unavailable",
                extra={
                    "run_id": run_id,
                    "stage": "discovery",
                    "required_source_keys": [provider.source_key for provider in self._providers],
                },
            )
            raise RuntimeError("No enabled discovery sources are configured")

        async def discover(provider: StoryDiscoveryProvider) -> tuple[DiscoveryCandidate, ...]:
            try:
                return await provider.discover(min(limit * 5, 100))
            except Exception as exc:
                counts["provider_failed"] += 1
                logger.warning(
                    "knowledge_provider_failed",
                    extra={
                        "run_id": run_id,
                        "stage": "discovery",
                        "provider": provider.name,
                        "failure_category": type(exc).__name__,
                    },
                )
                return ()

        batches = await bounded_map(providers, discover, self._discovery_concurrency)
        candidates = tuple(candidate for batch in batches for candidate in batch)
        counts["discovered"] = len(candidates)
        normalized: list[DiscoveryCandidate] = []
        hashes: set[str] = set()
        for candidate in candidates:
            try:
                url = self._canonicalize(candidate.url)
            except ValueError:
                counts["rejected_quality"] += 1
                continue
            digest = self._digest(url)
            if digest in hashes:
                counts["duplicates"] += 1
                continue
            hashes.add(digest)
            if candidate.source_key not in sources or len(candidate.title.strip()) < 10:
                counts["rejected_quality"] += 1
                continue
            if candidate.published_at and not now - RETENTION <= candidate.published_at <= now:
                counts["rejected_quality"] += 1
                continue
            normalized.append(replace(candidate, url=url))
        counts["normalized"] = len(normalized)

        # Bounded DB pages; compare each page against at most 200 candidates, then release it.
        after = None
        for _ in range(100):
            existing = await self._store.identities(after, 500)
            if not existing:
                break
            survivors = []
            for candidate in normalized:
                identity = self._identity(candidate, now)
                if any(self._similar(identity, previous) for _, previous in existing):
                    counts["duplicates"] += 1
                else:
                    survivors.append(candidate)
            normalized = survivors
            after = existing[-1][0]
        else:
            raise RuntimeError("Knowledge dedupe scan limit exceeded; cleanup requires attention")

        async def enrich(candidate: DiscoveryCandidate) -> DiscoveryCandidate | None:
            try:
                result = await self._enricher.enrich(candidate)
                if (
                    not result.published_at
                    or not now - RETENTION <= result.published_at <= now
                    or len(result.content.strip()) < 200
                    or not TECHNICAL.search(result.title + " " + result.content)
                    or re.search(r"\b(coupon|promo code|buy followers)\b", result.title, re.I)
                ):
                    counts["rejected_quality"] += 1
                    return None
                if not result.image_url:
                    counts["rejected_image_missing"] += 1
                    return None
                return result
            except Exception as exc:
                counts["enrichment_failed"] += 1
                logger.warning(
                    "knowledge_candidate_failed",
                    extra={
                        "run_id": run_id,
                        "stage": "enrichment",
                        "failure_category": type(exc).__name__,
                        "canonical_hash": self._digest(candidate.url),
                    },
                )
                return None

        enriched = await bounded_map(normalized, enrich, self._enrichment_concurrency)
        shortlist: list[DiscoveryCandidate] = []
        for enriched_candidate in enriched:
            if enriched_candidate is None:
                continue
            if any(
                self._similar(self._identity(enriched_candidate, now), self._identity(prior, now))
                for prior in shortlist
            ):
                counts["duplicates"] += 1
            else:
                shortlist.append(enriched_candidate)
        # Stable cheap priority before paid calls; only process enough chunks to fill the run limit.
        shortlist.sort(
            key=lambda c: (sources[c.source_key].quality_weight, c.published_at or now, c.url),
            reverse=True,
        )
        previews: list[KnowledgeStory] = []
        offset = 0
        while offset < len(shortlist):
            remaining = limit - len(previews)
            if remaining <= 0:
                break

            async def process(candidate: DiscoveryCandidate) -> KnowledgeStory | None:
                return await self._process(
                    candidate, sources[candidate.source_key], now, dry_run, run_id, counts
                )

            chunk = shortlist[offset : offset + remaining]
            offset += len(chunk)
            results = await bounded_map(chunk, process, self._workers)
            previews.extend(story for story in results if story is not None)
        counts["failed"] = sum(value for key, value in counts.items() if key.endswith("_failed"))
        logger.info(
            "knowledge_ingestion_complete",
            extra={
                "run_id": run_id,
                "stage": "complete",
                "counts": dict(counts),
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                "dry_run": dry_run,
            },
        )
        return IngestionResult(dict(counts), tuple(previews))

    def _identity(self, candidate: DiscoveryCandidate, now: datetime) -> StoryIdentity:
        return StoryIdentity(
            self._digest(candidate.url),
            candidate.title,
            candidate.url,
            candidate.published_at or now,
        )

    async def _process(
        self,
        candidate: DiscoveryCandidate,
        source: KnowledgeSource,
        now: datetime,
        dry_run: bool,
        run_id: str,
        counts: Counter[str],
    ) -> KnowledgeStory | None:
        digest = self._digest(candidate.url)
        stage = "image"
        key: str | None = None
        uploaded = False
        try:
            assert candidate.image_url is not None and candidate.published_at is not None
            # Validate/process images before paid model inference so invalid images cost no tokens.
            async with self._image_slots:
                image = await self._image_processor.process(candidate.image_url)
            counts["image_processed"] += 1
            stage = "model"
            async with self._model_slots:
                processed = await self._processor.process(candidate)
            counts["model_processed"] += 1
            if processed.quality_score < 0.5:
                counts["rejected_quality"] += 1
                return None
            sid = uuid5(NAMESPACE_URL, candidate.url)
            key = f"shorts/{candidate.published_at:%Y/%m/%d}/{digest}.webp"
            story = KnowledgeStory(
                id=sid,
                source=source,
                canonical_url=candidate.url,
                canonical_hash=digest,
                title=processed.title,
                summary=processed.summary,
                why_it_matters=processed.why_it_matters,
                image_url=self._images.public_url(key),
                image_key=key,
                published_at=candidate.published_at,
                discovered_at=now,
                importance_score=processed.importance_score,
                quality_score=processed.quality_score,
                topics=processed.topics,
                bullets=processed.bullets,
                external_id=candidate.external_id,
            )
            if dry_run:
                counts["would_persist"] += 1
                logger.info(
                    "knowledge_preview",
                    extra={
                        "run_id": run_id,
                        "stage": "preview",
                        "candidate_title": candidate.title,
                        "canonical_url": candidate.url,
                        "dedupe": "unique",
                        "image_key": key,
                        "chosen_image": candidate.image_url,
                        "story": asdict(story),
                    },
                )
                return story
            stage = "storage"
            # A final dedupe read protects an already-committed object's bytes from overwrite.
            if await self._store.contains(digest):
                counts["duplicates"] += 1
                return None
            async with self._r2_slots:
                await self._images.put(key, image)
            uploaded = True
            stage = "persistence"
            if not await self._store.persist(story):
                counts["duplicates"] += 1
                await self._compensate(key, digest, run_id)
                return None
            counts["persisted"] += 1
            return story
        except Exception as exc:
            category = "rejected_image_invalid" if stage == "image" else f"{stage}_failed"
            counts[category] += 1
            logger.warning(
                "knowledge_candidate_failed",
                extra={
                    "run_id": run_id,
                    "stage": stage,
                    "canonical_hash": digest,
                    "failure_category": type(exc).__name__,
                },
            )
            if uploaded and key:
                await self._compensate(key, digest, run_id)
            return None

    async def _compensate(self, key: str, digest: str, run_id: str) -> None:
        try:
            # A commit can succeed even if the connection fails before acknowledging it.
            # Never delete an image belonging to an already-persisted canonical story.
            if await self._store.contains(digest):
                return
            async with self._r2_slots:
                deleted = await self._images.delete((key,))
            if key in deleted:
                return
        except Exception as exc:
            logger.warning(
                "knowledge_compensation_failed",
                extra={
                    "run_id": run_id,
                    "failure_category": type(exc).__name__,
                    "image_key": key,
                },
            )
        logger.error(
            "knowledge_orphan_image",
            extra={
                "run_id": run_id,
                "stage": "compensation",
                "image_key": key,
            },
        )
