import logging
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from recallstack.modules.knowledge.application.ports import ImageStore, StoryStore
from recallstack.modules.knowledge.domain.entities import RETENTION

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CleanupResult:
    found: int = 0
    removed: int = 0
    images_deleted: int = 0
    failed: int = 0


class CleanupService:
    def __init__(
        self,
        store: StoryStore,
        images: ImageStore,
        *,
        batch_size: int = 100,
        max_batches: int = 10,
    ) -> None:
        self._store, self._images = store, images
        self._batch_size, self._max_batches = batch_size, max_batches

    async def run(self, now: datetime, *, dry_run: bool = False) -> CleanupResult:
        cutoff = now - RETENTION
        after: tuple[datetime, UUID] | None = None
        found = removed = images_deleted = failed = 0
        for _ in range(self._max_batches):
            batch = await self._store.expired(cutoff, after, self._batch_size)
            if not batch:
                break
            found += len(batch)
            after = (batch[-1].published_at, batch[-1].id)
            if dry_run:
                for story in batch:
                    logger.info(
                        "knowledge_cleanup_would_delete",
                        extra={
                            "stage": "cleanup",
                            "story_id": story.id,
                            "image_key": story.image_key,
                        },
                    )
                continue
            try:
                deleted = await self._images.delete(tuple(story.image_key for story in batch))
            except Exception as exc:
                logger.warning(
                    "knowledge_cleanup_storage_failure",
                    extra={
                        "stage": "cleanup",
                        "failure_category": type(exc).__name__,
                    },
                )
                deleted = frozenset()
            ids = tuple(story.id for story in batch if story.image_key in deleted)
            for story in batch:
                if story.image_key not in deleted:
                    logger.warning(
                        "knowledge_cleanup_retry",
                        extra={
                            "stage": "cleanup",
                            "story_id": story.id,
                            "image_key": story.image_key,
                        },
                    )
                    failed += 1
            images_deleted += len(ids)
            removed += await self._store.remove_expired(ids, cutoff)
        return CleanupResult(found, removed, images_deleted, failed)
