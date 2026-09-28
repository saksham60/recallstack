"""Replace cropped Knowledge images using each story's current source-page image."""

import argparse
import asyncio
import json
from datetime import UTC, datetime
from io import BytesIO
from urllib.parse import urljoin
from uuid import UUID

import httpx
from PIL import Image
from sqlalchemy import select, update

from recallstack.composition.knowledge_job import JobConfigurationError, refresh_lock
from recallstack.modules.knowledge.infrastructure.enrichment import ArticleParser
from recallstack.modules.knowledge.infrastructure.image_processing import WebPImageProcessor
from recallstack.modules.knowledge.infrastructure.providers.http import ProviderHttp
from recallstack.modules.knowledge.infrastructure.providers.r2 import R2ImageStore
from recallstack.modules.knowledge.infrastructure.safe_fetch import SafeFetcher
from recallstack.modules.knowledge.infrastructure.sqlalchemy_models import KnowledgeStoryModel
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.database.event_loop import configure_psycopg_event_loop


async def run(
    settings: Settings, *, apply: bool, limit: int, story_id: UUID | None
) -> dict[str, int | bool | str]:
    if not settings.database_url:
        raise JobConfigurationError("DATABASE_URL is required")
    if apply and not all(
        (
            settings.r2_public_base_url,
            settings.r2_bucket,
            settings.r2_access_key_id,
            settings.r2_secret_access_key,
            settings.r2_endpoint_url or settings.r2_account_id,
        )
    ):
        raise JobConfigurationError("R2 settings are required to apply image repairs")

    counts = {"checked": 0, "repaired": 0, "failed": 0, "oldImageDeletesFailed": 0}
    async with refresh_lock(settings.database_url) as acquired:
        if not acquired:
            return {**counts, "dryRun": not apply, "status": "refresh_running"}
        database = Database(settings)
        try:
            async with (
                httpx.AsyncClient(timeout=45, trust_env=False) as upload_client,
                httpx.AsyncClient(timeout=20, trust_env=False) as download_client,
            ):
                fetcher = SafeFetcher(download_client)
                processor = WebPImageProcessor(
                    fetcher, max_bytes=settings.knowledge_image_max_bytes
                )
                images = (
                    R2ImageStore(
                        ProviderHttp(upload_client),
                        endpoint=settings.r2_endpoint_url
                        or f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
                        bucket=settings.r2_bucket,
                        public_base=settings.r2_public_base_url,
                        access_key=settings.r2_access_key_id.get_secret_value()
                        if settings.r2_access_key_id
                        else "",
                        secret_key=settings.r2_secret_access_key.get_secret_value()
                        if settings.r2_secret_access_key
                        else "",
                    )
                    if apply
                    else None
                )
                statement = (
                    select(KnowledgeStoryModel)
                    .where(
                        KnowledgeStoryModel.status == "active",
                        ~KnowledgeStoryModel.image_key.endswith("-uncropped.webp"),
                    )
                    .order_by(KnowledgeStoryModel.published_at.desc())
                    .limit(limit)
                )
                if story_id:
                    statement = statement.where(KnowledgeStoryModel.id == story_id)
                async with database.session_factory.create_session() as session:
                    stories = list(await session.scalars(statement))
                if story_id and not stories:
                    return {
                        **counts,
                        "dryRun": not apply,
                        "status": "story_not_found_or_already_repaired",
                    }
                for story in stories:
                    counts["checked"] += 1
                    uploaded_key: str | None = None
                    try:
                        page = await fetcher.fetch(
                            story.canonical_url,
                            max_bytes=1_048_576,
                            allowed_types=frozenset({"text/html", "application/xhtml+xml"}),
                        )
                        parser = ArticleParser()
                        parser.feed(page.body.decode("utf-8", errors="replace"))
                        if not parser.image:
                            raise ValueError("Source page has no image")
                        content = await processor.process(urljoin(page.url, parser.image))
                        with Image.open(BytesIO(content)) as image:
                            dimensions = image.size
                        print(json.dumps({"storyId": str(story.id), "newDimensions": dimensions}))
                        if not apply:
                            continue
                        assert images is not None
                        old_key = story.image_key
                        if not old_key.endswith(".webp"):
                            raise ValueError("Unexpected stored image key")
                        new_key = f"{old_key[:-5]}-uncropped.webp"
                        await images.put(new_key, content)
                        uploaded_key = new_key
                        published = await fetcher.fetch(
                            images.public_url(new_key),
                            max_bytes=1_048_576,
                            allowed_types=frozenset({"image/webp"}),
                        )
                        if published.body != content:
                            raise ValueError("Published image differs from uploaded image")
                        async with (
                            database.session_factory.create_session() as session,
                            session.begin(),
                        ):
                            updated = await session.scalar(
                                update(KnowledgeStoryModel)
                                .where(
                                    KnowledgeStoryModel.id == story.id,
                                    KnowledgeStoryModel.image_key == old_key,
                                )
                                .values(
                                    image_key=new_key,
                                    image_url=images.public_url(new_key),
                                    updated_at=datetime.now(UTC),
                                )
                                .returning(KnowledgeStoryModel.id)
                            )
                        if updated is None:
                            raise ValueError("Story changed during image repair")
                        uploaded_key = None
                        counts["repaired"] += 1
                        try:
                            deleted = await images.delete((old_key,))
                        except Exception:
                            deleted = frozenset()
                        if old_key not in deleted:
                            counts["oldImageDeletesFailed"] += 1
                            print(
                                json.dumps(
                                    {
                                        "storyId": str(story.id),
                                        "oldImageKey": old_key,
                                        "cleanup": "failed",
                                    }
                                )
                            )
                    except Exception as exc:
                        counts["failed"] += 1
                        print(
                            json.dumps(
                                {
                                    "storyId": str(story.id),
                                    "failureCategory": type(exc).__name__,
                                    "possibleOrphanKey": uploaded_key,
                                }
                            )
                        )
        finally:
            await database.close()
    return {**counts, "dryRun": not apply}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Upload images and update stories; default is read-only",
    )
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--story-id", type=UUID)
    args = parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error("--limit must be between 1 and 100")
    configure_psycopg_event_loop()
    try:
        outcome = asyncio.run(
            run(Settings(), apply=args.apply, limit=args.limit, story_id=args.story_id)
        )
        print(json.dumps(outcome))
        return (
            0
            if outcome["failed"] == 0
            and outcome["oldImageDeletesFailed"] == 0
            and "status" not in outcome
            else 1
        )
    except JobConfigurationError as exc:
        print(str(exc))
        return 1
    except Exception as exc:
        print(json.dumps({"failureCategory": type(exc).__name__}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
