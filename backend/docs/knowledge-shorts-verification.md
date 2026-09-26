# Knowledge Shorts implementation verification

Verified 2026-09-26. Implementation is in commit `978f17d` (`knowledge`). A final test
line-wrap correction and this report were added after that commit. No deployment was performed.

## Architecture

One Knowledge module in the existing modular monolith: domain values/ranking, application services
and ports, SQLAlchemy adapters, separate API schemas/routes, and separate job composition. The API
constructs no ingestion providers. The job uses the same image with cleanup first, bounded workers,
Tavily/HN discovery, validated Nemotron output, WebP processing, R2 storage, and atomic persistence.
Only Pillow was added as a dependency. Duplicate DB test suites were consolidated into one.

## Verification results

| Check | Result |
| --- | --- |
| `uv run ruff format --check .` | Passed; 270 files |
| `uv run ruff check .` | Passed |
| `uv run mypy src/recallstack` | Passed; 192 source files |
| `uv run pytest -q` | 164 passed, 45 skipped |
| `RUN_KNOWLEDGE_CONTRACT_TESTS=1 uv run pytest tests/integration/test_knowledge.py -q` | 5 passed against the configured PostgreSQL schema; data writes rolled back |
| Production requirements vulnerability audit | Failed on existing unchanged AnyIO 4.14.1 and cryptography 49.0.0 pins |
| Five-story real provider dry run | Not completed: backend job configuration missing |
| Five-story R2/persistence run and public URL validation | Not completed |
| Production image build / complete existing PostgreSQL integration suite | Not run: Docker engine unavailable; standard integration tests opt-in |

The audit reported CVE-2026-63374, CVE-2026-64847 and CVE-2026-63349 for AnyIO (fixed in
4.14.2), plus PYSEC-2026-3552 for cryptography (fixed in 50.0.0; duplicate audit entry).
The environment-wide audit also reported pip 26.1.2; pip is not in the production requirements.
These dependency pins predate this change. No vulnerability suppressions were added.

The live contract checks cover filtered/ranked feed reads, stable cursor pages, SQL/domain score
agreement, six SELECTs per populated feed page, event idempotency and owner checks, late event
ordering, retention despite R2 failure, actual cleanup cascades, preference preservation, advisory
lock overlap/release, conflict-safe story persistence, and rollback of a failed story/topic transaction.
Normal unit/provider/API tests use fakes and spend no provider credits.

The attempted `--dry-run --limit 5` exited nonzero with a safe missing-configuration message:
`NEBIUS_API_KEY`, `R2_PUBLIC_BASE_URL`, and `TAVILY_API_KEY`. Existing web-local Tavily/Nebius
credentials were detected but were not copied or logged. R2 configuration was absent. No real
provider, upload, or deletion success is claimed.

## API and configuration

Authenticated endpoints:

- `GET /api/v1/knowledge/feed`
- `GET /api/v1/knowledge/stories/{storyId}`
- `GET /api/v1/knowledge/preferences`
- `PATCH /api/v1/knowledge/preferences`
- `POST /api/v1/knowledge/events/batch`

All environment variables and defaults are in [`.env.example`](../.env.example), with API/job
requirements and request examples in [`knowledge-shorts.md`](knowledge-shorts.md).
API serving requires `KNOWLEDGE_ENABLED=true` and a shared 32+ character
`KNOWLEDGE_CURSOR_SECRET`, in addition to the existing database/auth settings. Retention is fixed
at seven days. Job-only provider keys do not become API dependencies.

Cloud Run API command (use the configured PORT):

```bash
uvicorn recallstack.main:app --host 0.0.0.0 --port 8080 --no-proxy-headers
```

Cloud Run Job command, using the same image:

```bash
python -m recallstack.modules.knowledge.jobs.refresh --limit 20
```

Local no-write dry run and separate five-story real run:

```bash
uv run python -m recallstack.modules.knowledge.jobs.refresh --dry-run --limit 5
uv run python -m recallstack.modules.knowledge.jobs.refresh --limit 5
```

## Schema and deployment steps

All eight externally owned tables exist in the configured database, with matching columns and
expected indexes. No migration was created or applied. The exact expected contract is in
[`knowledge-shorts-contract.md`](knowledge-shorts-contract.md): `knowledge_sources`,
`knowledge_stories`, `knowledge_story_topics`, `user_knowledge_preferences`, `user_knowledge_topics`,
`user_knowledge_sources`, `user_story_events`, and `user_story_state`. User ownership is `profiles.id`.

Remaining steps:

1. Seed enabled `web` and `hacker_news` registry rows through the schema owner's workflow; the
   configured source registry is currently empty.
2. Configure API cursor secret and job-specific provider/R2 secrets and CDN base URL.
3. Resolve the existing dependency audit findings before relying on CI/deployment approval.
4. Run the real dry run, then the separate five-story persisted run; check `persisted: 5`, public
   images, and the authenticated feed. A requested limit is not a guarantee when quality gates reject stories.
5. Build/deploy the same image as API and Job, use a direct/session DB connection for job locking,
   and configure Cloud Scheduler.

## Performance limits

The verified feed query count is six SELECTs for nonempty pages (five when empty), independent of
page size, plus existing auth queries. Topics are loaded in one batch. Feed reads never aggregate
raw events or call providers. Signed keyset cursors preserve the ranking anchor while each request
independently enforces the current retention cutoff.

The seven-day candidate set can still require sorting for personalized scores. Six sequential DB
round trips and existing auth make regional placement significant. No production P50/P95 load result
is claimed. Image processing runs off the event loop; all worker/stage concurrency is bounded.
Process termination after upload and before commit can still leave an orphan; deterministic keys
limit retry duplication, with best-effort compensation and explicit orphan-key logging.

## Final module tree

```text
modules/knowledge/
  __init__.py
  application/
    __init__.py
    cleanup.py
    concurrency.py
    cursor.py
    errors.py
    events.py
    feed.py
    ingestion.py
    ports.py
    preferences.py
  domain/
    __init__.py
    entities.py
    ranking.py
  infrastructure/
    __init__.py
    canonicalization.py
    dedupe.py
    enrichment.py
    event_repository.py
    image_processing.py
    mappers.py
    preference_repository.py
    providers/
      __init__.py
      hacker_news.py
      http.py
      nemotron.py
      r2.py
      tavily.py
    repositories.py
    safe_fetch.py
    sqlalchemy_models.py
    story_store.py
  jobs/
    __init__.py
    refresh.py
  presentation/
    __init__.py
    routes.py
    schemas.py
```

## Exact files added

- `backend/docs/knowledge-shorts-contract.md`
- `backend/docs/knowledge-shorts-verification.md`
- `backend/docs/knowledge-shorts.md`
- `backend/src/recallstack/composition/knowledge_job.py`
- `backend/src/recallstack/composition/knowledge_uow.py`
- `backend/src/recallstack/modules/knowledge/__init__.py`
- `backend/src/recallstack/modules/knowledge/application/__init__.py`
- `backend/src/recallstack/modules/knowledge/application/cleanup.py`
- `backend/src/recallstack/modules/knowledge/application/concurrency.py`
- `backend/src/recallstack/modules/knowledge/application/cursor.py`
- `backend/src/recallstack/modules/knowledge/application/errors.py`
- `backend/src/recallstack/modules/knowledge/application/events.py`
- `backend/src/recallstack/modules/knowledge/application/feed.py`
- `backend/src/recallstack/modules/knowledge/application/ingestion.py`
- `backend/src/recallstack/modules/knowledge/application/ports.py`
- `backend/src/recallstack/modules/knowledge/application/preferences.py`
- `backend/src/recallstack/modules/knowledge/domain/__init__.py`
- `backend/src/recallstack/modules/knowledge/domain/entities.py`
- `backend/src/recallstack/modules/knowledge/domain/ranking.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/__init__.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/canonicalization.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/dedupe.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/enrichment.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/event_repository.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/image_processing.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/mappers.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/preference_repository.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/providers/__init__.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/providers/hacker_news.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/providers/http.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/providers/nemotron.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/providers/r2.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/providers/tavily.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/repositories.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/safe_fetch.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/sqlalchemy_models.py`
- `backend/src/recallstack/modules/knowledge/infrastructure/story_store.py`
- `backend/src/recallstack/modules/knowledge/jobs/__init__.py`
- `backend/src/recallstack/modules/knowledge/jobs/refresh.py`
- `backend/src/recallstack/modules/knowledge/presentation/__init__.py`
- `backend/src/recallstack/modules/knowledge/presentation/routes.py`
- `backend/src/recallstack/modules/knowledge/presentation/schemas.py`
- `backend/tests/integration/test_knowledge.py`
- `backend/tests/knowledge/__init__.py`
- `backend/tests/knowledge/fakes.py`
- `backend/tests/knowledge/test_api.py`
- `backend/tests/knowledge/test_domain.py`
- `backend/tests/knowledge/test_job.py`
- `backend/tests/knowledge/test_pipeline.py`
- `backend/tests/knowledge/test_providers.py`

## Exact files modified

- `backend/.env.example`
- `backend/README.md`
- `backend/openapi.json`
- `backend/pyproject.toml`
- `backend/src/recallstack/main.py`
- `backend/src/recallstack/shared/config/settings.py`
- `backend/tests/schema/test_architecture.py`
- `backend/uv.lock`

After the user push, `backend/tests/integration/test_knowledge.py` also has one formatting-only
line wrap pending.
