from contextlib import asynccontextmanager

import pytest

from recallstack.composition.knowledge_job import JobConfigurationError, validate_job
from recallstack.modules.knowledge.application.cleanup import CleanupResult
from recallstack.modules.knowledge.application.ingestion import IngestionResult
from recallstack.modules.knowledge.jobs import refresh
from recallstack.shared.config import Settings


def settings(**changes):
    return Settings(
        _env_file=None,
        supabase_project_url="https://example.supabase.co",
        database_url="postgresql://test:test@localhost:5432/test",
        nebius_api_key="test",
        tavily_api_key="test",
        r2_public_base_url="https://cdn.example.com",
        **changes,
    )


def test_job_configuration_separates_dry_run_and_real_storage_requirements():
    configured = settings()
    validate_job(configured, "all", dry_run=True)
    with pytest.raises(JobConfigurationError, match="R2_ACCESS_KEY_ID"):
        validate_job(configured, "all", dry_run=False)
    validate_job(
        settings(
            r2_access_key_id="test",
            r2_secret_access_key="test",
            r2_account_id="test",
            r2_bucket="shorts",
        ),
        "all",
        dry_run=False,
    )


async def test_refresh_cleans_first_passes_dry_run_and_releases_lock(monkeypatch):
    order = []

    @asynccontextmanager
    async def lock(url):
        order.append("lock")
        try:
            yield True
        finally:
            order.append("unlock")

    class Cleanup:
        async def run(self, now, *, dry_run):
            assert dry_run
            order.append("cleanup")
            return CleanupResult(found=2)

    class Ingestion:
        async def run(self, *, limit, dry_run, run_id):
            assert limit == 5 and dry_run and run_id
            order.append("ingestion")
            return IngestionResult({"would_persist": 0}, ())

    @asynccontextmanager
    async def services(config, source):
        yield Cleanup(), Ingestion()

    monkeypatch.setattr(refresh, "refresh_lock", lock)
    monkeypatch.setattr(refresh, "job_services", services)
    result = await refresh.run(settings(), limit=5, source="all", dry_run=True)
    assert order == ["lock", "cleanup", "ingestion", "unlock"]
    assert result["dryRun"] is True
    assert result["counts"] == {"would_persist": 0}


async def test_overlap_exits_without_building_job_services(monkeypatch):
    @asynccontextmanager
    async def lock(url):
        yield False

    monkeypatch.setattr(refresh, "refresh_lock", lock)
    result = await refresh.run(settings(), limit=5, source="all", dry_run=True)
    assert result["status"] == "already_running"
