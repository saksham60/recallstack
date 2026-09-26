# Knowledge Shorts

Knowledge is a module in the existing FastAPI modular monolith. API composition is in
`composition/knowledge_uow.py`; job composition is in `composition/knowledge_job.py`.
No migrations, frontend changes, Supabase SDK, additional service, or broker are required by the code.
Apply the separately owned Knowledge schema before enabling the feature.

## Online API

Enable `KNOWLEDGE_ENABLED=true` and set a random `KNOWLEDGE_CURSOR_SECRET` of at least 32 characters.
Use the same secret on every API instance. API containers do not need Tavily, Nebius, or R2 credentials.
The default is disabled so deploying code before its database migration does not expose broken routes.

All endpoints use the existing bearer-token/current-profile authentication:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/knowledge/feed` | `limit` defaults to 20, maximum 50; optional `cursor`, `topic` |
| GET | `/api/v1/knowledge/stories/{storyId}` | Active, unexpired story; unavailable stories return 404 |
| GET | `/api/v1/knowledge/preferences` | Structured preferences for the verified profile |
| PATCH | `/api/v1/knowledge/preferences` | Replace supplied preference collections; omitted fields unchanged |
| POST | `/api/v1/knowledge/events/batch` | 1–100 events in one transaction |

Responses use camelCase. Images are direct CDN URLs; internal keys are never returned. The feed service
depends only on a UoW, cursor codec, and deterministic ranking policy. Its import/dependency path cannot
construct discovery, inference, image, or storage clients.

Example preference patch:

```json
{
  "minimumImportance": 0.3,
  "topics": [{"topic": "distributed-systems", "weight": 1, "blocked": false}],
  "sources": [{"key": "web", "enabled": true, "weight": 1}]
}
```

Collections contain at most 50 unique entries. `[]` clears that collection; `null` is rejected. Topics
normalize to lowercase with whitespace replaced by hyphens; accepted characters are letters, digits,
`.`, `+`, `#`, and `-`. Unknown source keys are rejected. Topics form an open normalized vocabulary.
Weights are between 0 and 2. A blocked topic or explicitly disabled source excludes matching stories;
followed topics and enabled sources add ranking weight. An absent source preference uses global defaults.

Each event supplies `eventId`, `storyId`, `type`, and timezone-aware `occurredAt`. Supported types are
VIEW, OPEN, SAVE, UNSAVE, HIDE, UNHIDE, SHARE, and ASK_REASONAI. Event timestamps must be within the last
seven days, with five minutes of allowed future client clock skew. Reusing an ID with different data or
another profile returns 409. Exact retries return an accepted count of zero. The latest `(occurred_at,
event_id)` per state family controls SAVE/UNSAVE and HIDE/UNHIDE; VIEW sets the latest seen time. Late
batches cannot undo newer state. History reconciliation occurs only on writes. A per-profile PostgreSQL
transaction lock serializes event projections and preference patches. No client-provided profile ID is accepted.

## Ranking and pagination

The domain policy weights importance (0.40), story quality (0.20), source quality (0.10), maximum matching
explicit topic weight (0.15), source preference (0.05), and linear seven-day freshness (0.10). SQL mirrors
this policy using numeric arithmetic rounded to eight decimal places. No learned signal or LLM ranking
is used in this version. Domain and SQL score agreement is covered by contract verification.

Cursors are HMAC-signed, URL-safe, bounded to 2048 characters, profile/topic scoped, and expire after one
hour. They contain a ranking anchor and `(score, published_at, story_id)` ordering tuple. Stories created
or discovered after that anchor wait until a new pagination session. Ingestion does not edit existing
stories. Preference/source changes invalidate the cursor with 409; restart from page one. Secret rotation
also resets pagination. Every page independently checks the **current** seven-day cutoff and current
hidden state, so expiration or hiding can shorten a session. It cannot reveal stale stories.

## Offline lifecycle

The refresh command obtains a PostgreSQL session advisory lock on a dedicated nonpooled connection.
Use a direct or session-pooler database URL; transaction pooling is incompatible (Supabase port 6543 is
rejected). A competing run exits successfully with `already_running`. Normal completion and exceptions
release the lock. The job then:

1. Cleans expired rows in bounded batches, using stored `image_key` values.
2. Discovers from Tavily news search and the official Hacker News API.
3. Canonicalizes URLs and checks exact and conservative title duplicates against bounded DB pages.
4. Fetches missing article metadata/content, checks recency and technical-content gates, and shortlists.
5. Downloads and validates the chosen article image, then transforms it to WebP off the event loop.
6. Requests strict structured Nemotron output and validates all fields, lengths, topics, and scores.
7. Uploads R2 bytes and commits the story/topics atomically in a short database transaction.

Image validation precedes paid inference to avoid spending tokens on stories that cannot be displayed.
No branded or generated fallback exists. Outcomes distinguish `rejected_image_missing` and
`rejected_image_invalid`. Articles lacking a verifiable recent publication timestamp are rejected.
HN uses the item's publication timestamp; web discovery uses the provider/article timestamp.

The source registry must contain enabled keys `web` (Tavily) and `hacker_news` (HN), with UUIDs, display
names, source types, and quality weights supplied by your separately owned migration/seed. The job never
creates sources silently. Adding a provider requires an adapter implementing `StoryDiscoveryProvider` and
composition wiring, not an orchestration rewrite.

Only bounded worker tasks are created. Discovery, article enrichment, model calls, image work, and R2
uploads have separate limits. Provider failures are categorized without logging remote bodies or secrets.
HTTP 429/5xx and network/timeout failures have bounded retries. Other HTTP failures and malformed model
outputs are not retried automatically. One failed candidate does not discard successful siblings.

## Retention and R2

Retention is fixed at seven days. Read queries enforce active status and `published_at >= UTC now - 7 days`
even if cleanup fails. Future publication timestamps are excluded. User preferences are never cleaned up.
The deep-link endpoint also excludes globally disabled sources; it does not apply a user's feed preferences.

Cleanup deletes R2 objects in batches of at most 1000, then deletes only expired rows whose keys were
acknowledged deleted. FK cascades remove topics, event history, and story state. Partial storage failures
retain retryable database rows. The cleanup cursor advances past failed rows so they do not starve the
rest of a batch; a later job retries them. Default work is bounded to 10 batches of 100 stories.

Keys are `shorts/YYYY/MM/DD/<canonical-url-sha256>.webp`, using the source publication date. IDs are
deterministic UUIDv5 values derived from canonical URLs. Database conflicts never duplicate stories.
Failed database persistence triggers best-effort image deletion. A read first checks for a potentially
successful but unacknowledged commit, protecting already-persisted images. If that check or deletion
fails, `knowledge_orphan_image` logs the exact key for operations. Process termination can still leave
an orphan between upload and commit; retries reuse deterministic keys. No automatic bucket-wide sweep
is performed. Public URLs are built from `R2_PUBLIC_BASE_URL`; FastAPI never proxies image bytes.

One 1080×1350 WebP variant is generated at quality 82, capped at 1 MiB. Downloads are capped at 8 MiB by
default, decoded images at 20 million pixels, and minimum dimensions at 240 pixels. Animated images,
unsupported types, compressed HTTP bodies, and private destinations are rejected. Downloads resolve and
validate all DNS answers and pin a public address for the actual connection, preserving TLS SNI and Host.
Every redirect is revalidated (at most three followed redirects); total download time is bounded.
Trusted provider HTTP connections are pooled. Untrusted downloads share a client with keepalive disabled
to avoid cross-host TLS reuse when pinning IPs. The R2 adapter uses the existing HTTP client and a narrow
SigV4 implementation, verified against AWS's published signature vector; no additional storage SDK is added.

## Configuration and commands

See `.env.example` for all defaults. API-only variables are `KNOWLEDGE_ENABLED`,
`KNOWLEDGE_CURSOR_SECRET`, `KNOWLEDGE_FEED_DEFAULT_LIMIT`, and `KNOWLEDGE_FEED_MAX_LIMIT`.
Both processes use the existing Settings/DB/auth configuration.

Job variables:

- `TAVILY_API_KEY` (unless `--source hacker_news`), `NEBIUS_API_KEY`, `KNOWLEDGE_MODEL`,
  `KNOWLEDGE_MODEL_BASE_URL`.
- `R2_ACCOUNT_ID` or `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
  `R2_PUBLIC_BASE_URL`. Endpoint defaults to `https://<account>.r2.cloudflarestorage.com`.
- `KNOWLEDGE_BATCH_SIZE`, `KNOWLEDGE_DISCOVERY_TOPICS` (1–8 comma-separated queries).
- `KNOWLEDGE_DISCOVERY_CONCURRENCY`, `KNOWLEDGE_ENRICHMENT_CONCURRENCY`,
  `KNOWLEDGE_MODEL_CONCURRENCY`, `KNOWLEDGE_IMAGE_CONCURRENCY`, `KNOWLEDGE_R2_CONCURRENCY`.
- `KNOWLEDGE_CLEANUP_BATCH_SIZE`, `KNOWLEDGE_CLEANUP_MAX_BATCHES`, `KNOWLEDGE_PROVIDER_TIMEOUT`,
  `KNOWLEDGE_PROVIDER_RETRIES`, `KNOWLEDGE_IMAGE_MAX_BYTES`.

From `backend/`, install `uv sync --frozen`, configure secrets locally or through Secret Manager, then:

```bash
uv run python -m recallstack.modules.knowledge.jobs.refresh --dry-run --limit 5
uv run python -m recallstack.modules.knowledge.jobs.refresh --dry-run --limit 5 --source tavily
uv run python -m recallstack.modules.knowledge.jobs.refresh --limit 5
```

Dry run has **no DB writes, R2 uploads, R2 deletes, or cleanup mutations**. It still needs database reads,
real discovery/model credentials, and the intended public CDN base to report prospective URLs. It does
not need R2 write credentials. It reports would-delete keys, discovery/dedupe outcomes, chosen image,
processed content, intended key, and prospective story objects. Real provider calls can consume credits.
`would_persist` is never reported as `persisted`.

The separate real run must be checked for `persisted: 5`; `--limit 5` is a success ceiling, not a guarantee
when providers or quality gates reject candidates. Verify returned public image URLs and call the
authenticated feed with `limit=5` before frontend integration. Missing settings, database failures, and
other job-level errors return nonzero; candidate/provider failures produce explicit outcome counts.

The same production image runs either entrypoint:

```bash
# Cloud Run API (the image's existing default command)
uvicorn recallstack.main:app --host 0.0.0.0 --port 8080 --no-proxy-headers
# Cloud Run Job command: python; args: -m recallstack.modules.knowledge.jobs.refresh --limit 20
python -m recallstack.modules.knowledge.jobs.refresh --limit 20
```

Configure Cloud Scheduler to execute the job. Set one task per execution; the database lock guards
overlapping executions. Configure job-only provider secrets separately from the API service.

## Database ownership and verification

The eight externally owned tables and exact columns are listed in `knowledge-shorts-contract.md`.
The backend does not create tables or run migration commands for this module. Include the external
migration in the CI test database before running `tests/integration/test_knowledge.py`; it explicitly
reports missing tables rather than creating a substitute schema. Avoid autogenerating backend
Alembic changes for these externally owned tables.

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy src/recallstack
uv run pytest
uv export --frozen --no-dev --no-emit-project -o .audit-requirements.txt
uv run pip-audit -r .audit-requirements.txt
```

Full standard integration testing uses the repository's `RUN_INTEGRATION_TESTS=1` with Docker or an
isolated `TEST_DATABASE_URL`. Separately, `tests/integration/test_knowledge.py` can verify a deployed
contract using `DATABASE_URL` without migrations. Every data write is inside an outer transaction that
is rolled back, with service commits isolated by savepoints. No provider calls occur. Opt in explicitly:

```powershell
$env:RUN_KNOWLEDGE_CONTRACT_TESTS='1'
uv run pytest tests/integration/test_knowledge.py -q
```

## Performance audit

A populated feed page makes six SELECTs: three bounded preference reads, the source registry, the ranked
story/source/state join, and one batched topics query. Empty pages omit the topics query. Query count is
independent of page size; auth queries are additional and belong to the existing current-user path.
The domain score is computed in SQL over eligible seven-day rows, with keyset predicates and `LIMIT N+1`.
No OFFSET, per-story query, raw-event aggregation, external call, or long-lived background transaction
appears in the feed path. Connections close before serialization.

Expected indexes include `(status,published_at DESC)`, `(status,importance_score DESC,published_at DESC)`,
`(source_id,status,published_at DESC)`, topic `(topic,story_id)`, and state PK `(profile_id,story_id)`.
Explicit personalized scoring may require a bounded-window sort even with these indexes. Benchmark with
production seven-day volume and API/DB regional placement; P50/P95 targets are not established by unit
tests or remote developer-machine measurements. Six sequential DB round trips plus existing auth can
dominate latency across regions. A 20-story payload is bounded by text/topic limits and excludes bullets
and internal metadata. No Redis or process-local authoritative cache is required.

Provider contracts checked against [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search),
[official HN API](https://github.com/HackerNews/API), [Nebius OpenAPI](https://api.tokenfactory.nebius.com/openapi.json),
[R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), and
[AWS SigV4 examples](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html).
