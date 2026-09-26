import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from recallstack.modules.knowledge.application.cleanup import CleanupService
from recallstack.modules.knowledge.application.concurrency import bounded_map
from tests.knowledge.fakes import (
    FakeImages,
    FakeProcessor,
    FakeProvider,
    FakeStore,
    candidate,
    ingestion,
    story,
)


async def test_dry_run_has_no_persistence_or_storage_mutations():
    store, images = FakeStore(), FakeImages()
    result = await ingestion(store, images).run(limit=5, dry_run=True, run_id="test")
    assert result.counts["would_persist"] == 1
    assert result.previews[0].image_key.endswith(".webp")
    assert store.persist_calls == store.remove_calls == 0
    assert images.uploads == images.deletes == []


async def test_real_run_is_idempotent_and_dedupes_tracking_urls():
    store, images = FakeStore(), FakeImages()
    original = candidate()
    provider = FakeProvider((original, replace(original, url=original.url + "?utm_source=hn")))
    service = ingestion(store, images, providers=(provider,))
    first = await service.run(limit=5, dry_run=False, run_id="one")
    second = await service.run(limit=5, dry_run=False, run_id="two")
    assert first.counts["persisted"] == first.counts["duplicates"] == 1
    assert second.counts["duplicates"] == 2
    assert store.persist_calls == len(images.uploads) == 1


async def test_persistence_failure_compensates_upload_and_logs_orphan_if_cleanup_fails(caplog):
    store, images = FakeStore(), FakeImages()
    store.fail_persist = True
    result = await ingestion(store, images).run(limit=1, dry_run=False, run_id="test")
    assert result.counts["persistence_failed"] == 1
    assert images.uploads == images.deletes
    images.fail_delete = True
    await ingestion(store, images).run(limit=1, dry_run=False, run_id="test")
    records = [r for r in caplog.records if r.message == "knowledge_orphan_image"]
    assert records and records[0].image_key == images.uploads[0]


async def test_provider_and_model_failure_are_isolated():
    class SometimesFails(FakeProcessor):
        async def process(self, item):
            if item.url.endswith("/0"):
                raise TimeoutError("model timeout")
            return await super().process(item)

    candidates = (
        candidate(0),
        replace(candidate(1), title="Rust compiler adds new type inference"),
    )
    result = await ingestion(
        providers=(FakeProvider(fail=True), FakeProvider(candidates)),
        processor=SometimesFails(),
    ).run(limit=5, dry_run=True, run_id="test")
    assert result.counts["provider_failed"] == result.counts["model_failed"] == 1
    assert result.counts["would_persist"] == 1


async def test_missing_invalid_images_and_stale_articles_are_explicit():
    class InvalidImages:
        async def process(self, url):
            raise ValueError("not an image")

    candidates = (
        replace(candidate(0), image_url=None),
        replace(candidate(1), title="Rust compiler adds new type inference"),
        replace(candidate(2), published_at=datetime.now(UTC) - timedelta(days=8)),
    )
    result = await ingestion(
        providers=(FakeProvider(candidates),), image_processor=InvalidImages()
    ).run(
        limit=5,
        dry_run=True,
        run_id="test",
    )
    assert result.counts["rejected_image_missing"] == 1
    assert result.counts["rejected_image_invalid"] == 1
    assert result.counts["rejected_quality"] == 1
    assert result.previews == ()


async def test_bounded_workers_preserve_order():
    active = peak = 0

    async def work(value):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        return value * 2

    assert await bounded_map(list(range(100)), work, 3) == tuple(i * 2 for i in range(100))
    assert peak == 3


async def test_pipeline_bounds_model_stage_and_can_fill_after_a_failure():
    active = peak = 0

    class Processor(FakeProcessor):
        async def process(self, item):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            try:
                await asyncio.sleep(0.01)
                if item.url.endswith("/5"):
                    raise TimeoutError("model timed out")
                return await super().process(item)
            finally:
                active -= 1

    candidates = tuple(
        replace(candidate(i), url=f"https://engineering{i}.example.com/{i}") for i in range(6)
    )
    result = await ingestion(
        providers=(FakeProvider(candidates),), processor=Processor(), model_concurrency=2
    ).run(limit=5, dry_run=True, run_id="test")
    assert len(result.previews) == 5 and result.counts["model_failed"] == 1
    assert peak == 2


async def test_no_discovery_call_when_source_registry_is_empty():
    class EmptyRegistry(FakeStore):
        async def sources(self):
            return ()

    with pytest.raises(RuntimeError, match="No enabled discovery sources"):
        await ingestion(store=EmptyRegistry()).run(limit=5, dry_run=True, run_id="test")


async def test_cleanup_retention_retry_and_preserved_preferences():
    now = datetime.now(UTC)
    old = story(0, published_at=now - timedelta(days=8))
    active = story(1, published_at=now - timedelta(days=7))
    store, images = FakeStore((old, active)), FakeImages()
    service = CleanupService(store, images, batch_size=1, max_batches=3)
    images.fail_delete = True
    first = await service.run(now)
    assert first.failed == 1 and first.removed == 0
    images.fail_delete = False
    second = await service.run(now)
    third = await service.run(now)
    assert second.removed == 1 and third.removed == 0
    assert images.deletes == [old.image_key, old.image_key]
    assert list(store.stories.values()) == [active]
    assert store.preferences == {"preserved": True}


async def test_cleanup_dry_run_is_bounded_and_strictly_read_only():
    now = datetime.now(UTC)
    store = FakeStore(tuple(story(i, published_at=now - timedelta(days=8)) for i in range(10)))
    images = FakeImages()
    result = await CleanupService(store, images, batch_size=2, max_batches=2).run(now, dry_run=True)
    assert result.found == 4 and result.removed == 0
    assert len(store.stories) == 10 and store.remove_calls == 0 and not images.deletes


@pytest.mark.parametrize("limit", [0, 101])
async def test_ingestion_limit_is_bounded(limit):
    with pytest.raises(ValueError):
        await ingestion().run(limit=limit, dry_run=True, run_id="test")
