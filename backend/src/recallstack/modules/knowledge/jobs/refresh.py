import argparse
import asyncio
import json
import logging
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import uuid4

from recallstack.composition.knowledge_job import (
    JobConfigurationError,
    job_services,
    refresh_lock,
    validate_job,
)
from recallstack.shared.config import Settings
from recallstack.shared.database.event_loop import configure_psycopg_event_loop
from recallstack.shared.logging import configure_logging

logger = logging.getLogger(__name__)


async def run(settings: Settings, *, limit: int, source: str, dry_run: bool) -> dict[str, object]:
    validate_job(settings, source, dry_run=dry_run)
    assert settings.database_url is not None
    run_id = str(uuid4())
    async with refresh_lock(settings.database_url) as acquired:
        if not acquired:
            logger.info("knowledge_refresh_already_running", extra={"run_id": run_id})
            return {"status": "already_running", "runId": run_id}
        async with job_services(settings, source) as (cleanup, ingestion):
            cleaned = await cleanup.run(datetime.now(UTC), dry_run=dry_run)
            result = await ingestion.run(limit=limit, dry_run=dry_run, run_id=run_id)
            return {
                "runId": run_id,
                "dryRun": dry_run,
                "cleanup": asdict(cleaned),
                "counts": result.counts,
                "stories": [asdict(story) for story in result.previews],
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


if __name__ == "__main__":
    raise SystemExit(main())
