import argparse
import asyncio
import json
import logging
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import text

from recallstack.composition.knowledge_job import (
    JobConfigurationError,
    job_services,
    refresh_lock,
    validate_job,
)
from recallstack.modules.knowledge.domain.entities import STORY_VISIBILITY_WINDOW
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.database.event_loop import configure_psycopg_event_loop
from recallstack.shared.logging import configure_logging
from recallstack.shared.observability.langsmith import flush, span

logger = logging.getLogger(__name__)


async def active_story_count(settings: Settings) -> int:
    """Count globally visible stories, excluding expired and disabled-source rows."""
    database = Database(settings)
    try:
        async with database.session_factory.create_session() as session:
            count = await session.scalar(
                text(
                    """
                    SELECT count(k.id)
                    FROM public.knowledge_stories k
                    JOIN public.knowledge_sources s ON s.id = k.source_id
                    WHERE k.status = 'active'
                      AND s.enabled
                      AND k.image_url IS NOT NULL
                      AND k.published_at <= now()
                      AND k.published_at >= now() - (:window_seconds * interval '1 second')
                    """
                ),
                {"window_seconds": int(STORY_VISIBILITY_WINDOW.total_seconds())},
            )
            return int(count or 0)
    finally:
        await database.close()


async def run(settings: Settings, *, limit: int, source: str, dry_run: bool) -> dict[str, object]:
    validate_job(settings, source, dry_run=dry_run)
    assert settings.database_url is not None
    run_id = str(uuid4())
    async with refresh_lock(settings.database_url) as acquired:
        if not acquired:
            logger.info("knowledge_refresh_already_running", extra={"run_id": run_id})
            return {"status": "already_running", "runId": run_id}
        with span(
            "knowledge.refresh",
            "chain",
            {"source": source, "limit": limit},
            {"run_id": run_id, "actor": "system"},
        ) as traced:
            async with job_services(settings, source) as (cleanup, ingestion):
                cleaned = await cleanup.run(datetime.now(UTC), dry_run=dry_run)
                before = None if dry_run else await active_story_count(settings)
                missing = (
                    max(settings.knowledge_min_active_stories - before, 0)
                    if before is not None
                    else limit
                )
                ingestion_limit = min(limit, missing)
                if ingestion_limit:
                    result = await ingestion.run(
                        limit=ingestion_limit, dry_run=dry_run, run_id=run_id
                    )
                    counts = result.counts
                    stories = [asdict(story) for story in result.previews]
                else:
                    counts = {"already_at_target": 1}
                    stories = []
                after = None if dry_run else await active_story_count(settings)
                if after is not None:
                    logger.info(
                        "knowledge_refresh_target_status",
                        extra={
                            "run_id": run_id,
                            "active_before": before,
                            "active_after": after,
                            "target_active": settings.knowledge_min_active_stories,
                            "shortfall": max(settings.knowledge_min_active_stories - after, 0),
                        },
                    )
                if traced:
                    traced.end(
                        outputs={"counts": counts, "dry_run": dry_run, "active_after": after}
                    )
                return {
                    "runId": run_id,
                    "dryRun": dry_run,
                    "cleanup": asdict(cleaned),
                    "counts": counts,
                    "stories": stories,
                    "activeStoriesBefore": before,
                    "activeStoriesAfter": after,
                    "targetActive": settings.knowledge_min_active_stories,
                    "targetReached": (
                        None if after is None else after >= settings.knowledge_min_active_stories
                    ),
                }


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh precomputed Knowledge Shorts")
    parser.add_argument("--dry-run", action="store_true", help="No DB writes, uploads or deletes")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--source", choices=("all", "tavily", "hacker_news"), default="all")
    args = parser.parse_args()
    configure_psycopg_event_loop()
    try:
        settings = Settings()
        configure_logging(settings.log_level)
        # Third-party HTTP loggers may include signed URLs; log only our safe stage summaries.
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        limit = args.limit if args.limit is not None else settings.knowledge_batch_size
        if not 1 <= limit <= 100:
            parser.error("--limit must be between 1 and 100")
        result = asyncio.run(run(settings, limit=limit, source=args.source, dry_run=args.dry_run))
        print(json.dumps(result, default=str, indent=2))
        return 0
    except JobConfigurationError as exc:
        logger.error("knowledge_job_configuration", extra={"detail": str(exc)})
        return 1
    except Exception as exc:
        # Do not render ValidationError inputs, DB URLs, remote responses or auth headers.
        logger.error("knowledge_job_failed", extra={"failure_category": type(exc).__name__})
        return 1
    finally:
        flush()


if __name__ == "__main__":
    raise SystemExit(main())
