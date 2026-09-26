import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from recallstack.modules.knowledge.application.cleanup import CleanupService
from recallstack.modules.knowledge.application.ingestion import IngestionService
from recallstack.modules.knowledge.application.ports import StoryDiscoveryProvider
from recallstack.modules.knowledge.infrastructure.canonicalization import (
    canonical_hash,
    canonicalize,
)
from recallstack.modules.knowledge.infrastructure.dedupe import similar
from recallstack.modules.knowledge.infrastructure.enrichment import ArticleEnricher
from recallstack.modules.knowledge.infrastructure.image_processing import WebPImageProcessor
from recallstack.modules.knowledge.infrastructure.providers.hacker_news import HackerNewsDiscovery
from recallstack.modules.knowledge.infrastructure.providers.http import ProviderHttp
from recallstack.modules.knowledge.infrastructure.providers.nemotron import NemotronProcessor
from recallstack.modules.knowledge.infrastructure.providers.r2 import R2ImageStore
from recallstack.modules.knowledge.infrastructure.providers.tavily import TavilyDiscovery
from recallstack.modules.knowledge.infrastructure.safe_fetch import SafeFetcher
from recallstack.modules.knowledge.infrastructure.story_store import SqlAlchemyStoryStore
from recallstack.shared.config import Settings
from recallstack.shared.database import Database

logger = logging.getLogger(__name__)
JOB_LOCK = 723104692115


class JobConfigurationError(ValueError):
    """Contains only missing setting names or a safe configuration explanation."""


def validate_job(settings: Settings, source: str, *, dry_run: bool) -> None:
    missing: list[str] = []
    for key in ("database_url", "nebius_api_key", "r2_public_base_url"):
        if not getattr(settings, key):
            missing.append(key.upper())
    if source in {"all", "tavily"} and not settings.tavily_api_key:
        missing.append("TAVILY_API_KEY")
    if not dry_run:
        for key in ("r2_access_key_id", "r2_secret_access_key", "r2_bucket"):
            if not getattr(settings, key):
                missing.append(key.upper())
        if not (settings.r2_endpoint_url or settings.r2_account_id):
            missing.append("R2_ENDPOINT_URL or R2_ACCOUNT_ID")
    if missing:
        raise JobConfigurationError("Refresh requires: " + ", ".join(missing))
    if settings.database_url and make_url(settings.database_url).port == 6543:
        raise JobConfigurationError(
            "Refresh needs a direct/session PostgreSQL connection, not transaction pooler"
        )


@asynccontextmanager
async def refresh_lock(database_url: str) -> AsyncIterator[bool]:
    # Dedicated nonpooled session: a lock is never returned to the API connection pool.
    engine = create_async_engine(database_url, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as connection:
            acquired = bool(
                await connection.scalar(
                    text("SELECT pg_try_advisory_lock(:key)"), {"key": JOB_LOCK}
                )
            )
            try:
                yield acquired
            finally:
                if acquired:
                    await connection.execute(
                        text("SELECT pg_advisory_unlock(:key)"), {"key": JOB_LOCK}
                    )
    finally:
        await engine.dispose()


@asynccontextmanager
async def job_services(
    settings: Settings,
    source: str,
) -> AsyncIterator[tuple[CleanupService, IngestionService]]:
    database = Database(settings)
    try:
        async with (
            httpx.AsyncClient(
                timeout=httpx.Timeout(settings.knowledge_provider_timeout, connect=5),
                limits=httpx.Limits(max_connections=24, max_keepalive_connections=12),
                trust_env=False,
            ) as client,
            httpx.AsyncClient(
                timeout=httpx.Timeout(20, connect=5),
                # Vetted IP + TLS hostname cannot share a pooled connection across origins.
                limits=httpx.Limits(max_connections=16, max_keepalive_connections=0),
                trust_env=False,
            ) as download_client,
        ):
            http = ProviderHttp(
                client,
                retries=settings.knowledge_provider_retries,
                timeout=settings.knowledge_provider_timeout,
            )
            store = SqlAlchemyStoryStore(database.session_factory)
            fetcher = SafeFetcher(download_client)
            images = R2ImageStore(
                http,
                endpoint=settings.r2_endpoint_url
                or (f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"),
                bucket=settings.r2_bucket,
                public_base=settings.r2_public_base_url,
                access_key=settings.r2_access_key_id.get_secret_value()
                if settings.r2_access_key_id
                else "",
                secret_key=settings.r2_secret_access_key.get_secret_value()
                if settings.r2_secret_access_key
                else "",
            )
            providers: list[StoryDiscoveryProvider] = []
            if source in {"all", "tavily"}:
                assert settings.tavily_api_key is not None
                providers.append(
                    TavilyDiscovery(
                        http,
                        settings.tavily_api_key.get_secret_value(),
                        tuple(
                            topic.strip()
                            for topic in settings.knowledge_discovery_topics.split(",")
                        ),
                        concurrency=settings.knowledge_discovery_concurrency,
                    )
                )
            if source in {"all", "hacker_news"}:
                providers.append(
                    HackerNewsDiscovery(http, concurrency=settings.knowledge_discovery_concurrency)
                )
            assert settings.nebius_api_key is not None
            yield (
                CleanupService(
                    store,
                    images,
                    batch_size=settings.knowledge_cleanup_batch_size,
                    max_batches=settings.knowledge_cleanup_max_batches,
                ),
                IngestionService(
                    store=store,
                    images=images,
                    providers=tuple(providers),
                    enricher=ArticleEnricher(fetcher),
                    processor=NemotronProcessor(
                        http,
                        key=settings.nebius_api_key.get_secret_value(),
                        model=settings.knowledge_model,
                        base_url=settings.knowledge_model_base_url,
                    ),
                    image_processor=WebPImageProcessor(
                        fetcher, max_bytes=settings.knowledge_image_max_bytes
                    ),
                    canonicalize=canonicalize,
                    digest=canonical_hash,
                    similar=similar,
                    discovery_concurrency=settings.knowledge_discovery_concurrency,
                    enrichment_concurrency=settings.knowledge_enrichment_concurrency,
                    model_concurrency=settings.knowledge_model_concurrency,
                    image_concurrency=settings.knowledge_image_concurrency,
                    r2_concurrency=settings.knowledge_r2_concurrency,
                ),
            )
    finally:
        await database.close()
