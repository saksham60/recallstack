# Knowledge Shorts

Knowledge is a module in the existing FastAPI modular monolith. API composition is in
`composition/knowledge_uow.py`; job composition is in `composition/knowledge_job.py`.
The database contract is owned by Alembic migration `20260926_0018_knowledge_shorts.py`, which is
idempotent against the already-provisioned Supabase schema and creates the same contract in fresh
environments. No Supabase SDK, additional service, broker, Redis, or vector database is required.

## Online API

Enable `KNOWLEDGE_ENABLED=true` and set a random `KNOWLEDGE_CURSOR_SECRET` of at least 32 characters.
Use the same secret on every API instance. API containers do not need Tavily, Nebius, or R2 credentials.
The default is disabled so code can deploy safely before the database migration is available.

All endpoints use the existing bearer-token/current-profile authentication:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/knowledge/feed` | `limit` defaults to 20, maximum 50; optional `cursor`, `topic`, `source` |
| GET | `/api/v1/knowledge/stories/{storyId}` | Active, unexpired story; unavailable stories return 404 |
| GET | `/api/v1/knowledge/preferences` | Structured preferences for the verified profile |
| PATCH | `/api/v1/knowledge/preferences` | Replace supplied preference collections; omitted fields unchanged |
| POST | `/api/v1/knowledge/events/batch` | 1–100 events in one transaction |

Responses use camelCase. Images are direct CDN URLs; internal R2 keys are never returned. Story responses
include `viewerState.saved` and `viewerState.seenAt` so the web client can restore persisted state without
replaying event history. Hidden stories are excluded from the feed. The feed service depends only on a UoW,
cursor codec, and deterministic ranking policy; its import/dependency path cannot construct discovery,
inference, image, or storage clients.

`source` accepts a registry key such as `web` or `hacker_news`. Unknown sources are rejected. `topic`
accepts normalized topic values. Nemotron stores one canonical broad category on every newly processed
story from this set:

```text
ai
agents
architecture
cloud
research
security
data
developer-tools
```

Specific open-vocabulary topics are stored alongside that broad category. This lets the web surface use
stable category chips while preserving detailed tags.

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
`.`, `+`, `#`, and `-`. Unknown source keys are rejected. Weights are between 0 and 2. A blocked topic or
explicitly disabled source excludes matching stories; followed topics and enabled sources add ranking
weight. An absent source preference uses global defaults.

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
this policy using numeric arithmetic rounded to eight decimal places. No learned signal or LLM ranking is
used on the feed path.

Cursors are HMAC-signed, URL-safe, bounded to 2048 characters, profile/topic/source scoped, and expire
after one hour. They contain a ranking anchor and `(score, published_at, story_id)` ordering tuple. Stories
created or discovered after that anchor wait until a new pagination session. Preference/source-registry
changes invalidate the cursor with 409; changing the requested topic or source also invalidates it. Secret
rotation resets pagination. Every page independently checks the current seven-day cutoff and hidden state,
so expiration or hiding can shorten a session but cannot expose stale stories.

## Offline lifecycle

The refresh command obtains a PostgreSQL session advisory lock on a dedicated nonpooled connection. Use a
direct or session-pooler database URL; transaction pooling is incompatible (Supabase port 6543 is rejected).
A competing run exits successfully with `already_running`. Normal completion and exceptions release the lock.
The job then:

1. Cleans expired rows in bounded batches, using stored `image_key` values.
2. Discovers from Tavily news search and the official Hacker News API.
3. Canonicalizes URLs and checks exact and conservative title duplicates against bounded DB pages.
4. Fetches article metadata/content, checks recency and technical-content gates, and shortlists.
5. Interleaves eligible sources before paid processing so a higher source weight cannot monopolize a small run.
6. Downloads and validates the chosen article image, then transforms it to WebP off the event loop.
7. Requests strict structured Nemotron output, including one broad category plus specific topics.
8. Uploads R2 bytes and commits the story/topics atomically in a short database transaction.

Image validation precedes paid inference to avoid spending tokens on stories that cannot be displayed.
No generic fallback exists. Outcomes distinguish `rejected_image_missing` and `rejected_image_invalid`.
Articles lacking a verifiable recent publication timestamp are rejected. HN uses the item's publication
timestamp; web discovery uses the provider/article timestamp.

The Alembic migration seeds enabled source keys `web` (Tavily) and `hacker_news` (HN) with the production
quality weights. The job never creates sources silently. Adding a provider requires an adapter implementing
`StoryDiscoveryProvider` plus composition wiring, not an orchestration rewrite.

Only bounded worker tasks are created. Discovery, article enrichment, model calls, image work, and R2
uploads have separate limits. Provider failures are categorized without logging remote bodies or secrets.
HTTP 429/5xx and network/timeout failures have bounded retries. Other HTTP failures and malformed model
outputs are not retried automatically. One failed candidate does not discard successful siblings.

## Retention and R2

Retention is fixed at seven days. Read queries enforce active status and `published_at >= UTC now - 7 days`
even if cleanup fails. Future publication timestamps are excluded. User preferences are never cleaned up.
The deep-link endpoint also excludes globally disabled sources; it does not apply a user's feed preferences.

Cleanup deletes R2 objects in bounded batches, then deletes expired rows whose keys were acknowledged
deleted. FK cascades remove topics, event history, and story state. Partial storage failures retain retryable
database rows, but those rows remain invisible because freshness is enforced on every read. Keys are
`shorts/YYYY/MM/DD/<canonical-url-sha256>.webp`; IDs are deterministic UUIDv5 values derived from canonical
URLs. Failed database persistence triggers best-effort image deletion and deterministic keys make retries safe.
FastAPI never proxies image bytes.

One 1080×1350 WebP variant is generated at quality 82, capped at 1 MiB. Downloads are capped at 8 MiB by
default, decoded images at 20 million pixels, and minimum dimensions at 240 pixels. Animated images,
unsupported types, compressed HTTP bodies, and private destinations are rejected. Every redirect is
revalidated. Untrusted downloads pin a validated public IP while preserving TLS SNI and Host.

## Configuration and commands

See `.env.example` for defaults. API-only Knowledge variables are `KNOWLEDGE_ENABLED`,
`KNOWLEDGE_CURSOR_SECRET`, `KNOWLEDGE_FEED_DEFAULT_LIMIT`, and `KNOWLEDGE_FEED_MAX_LIMIT`.

Job variables include `TAVILY_API_KEY`, `NEBIUS_API_KEY`, `KNOWLEDGE_MODEL`,
`KNOWLEDGE_MODEL_BASE_URL`, R2 credentials/configuration, discovery topics, bounded concurrency values,
cleanup bounds, provider timeout/retries, and the image-size limit. `R2_ENDPOINT_URL` is optional when
`R2_ACCOUNT_ID` is set.

From `backend/`:

```bash
uv run python -m recallstack.modules.knowledge.jobs.refresh --dry-run --limit 5
uv run python -m recallstack.modules.knowledge.jobs.refresh --dry-run --limit 5 --source tavily
uv run python -m recallstack.modules.knowledge.jobs.refresh --limit 5
```

Dry run has no DB writes, R2 uploads, R2 deletes, or cleanup mutations. It still performs real reads,
discovery, model inference, and image validation. A real run should be checked for persisted stories and
public image URLs before frontend integration.

The same production image runs either entrypoint:

```bash
# Cloud Run API: image default command
uvicorn recallstack.main:app --host 0.0.0.0 --port 8080 --no-proxy-headers

# Cloud Run Job
python -m recallstack.modules.knowledge.jobs.refresh --limit 20
```

Use one Cloud Run Job task per execution. Cloud Scheduler can trigger it later; the database advisory lock
protects against overlapping executions. Provider secrets remain job-only and are not required by the API.

## Database ownership and verification

Alembic migration `20260926_0018_knowledge_shorts.py` is the repository source of truth for the eight
Knowledge tables, indexes, RLS enablement, backend-only direct grants, and the `web` / `hacker_news` source
registry seeds. It uses `IF NOT EXISTS` / conflict-safe operations because production Supabase was provisioned
before this migration was checked into the repository. Fresh CI/local databases are now reproducible from
`alembic upgrade head`.

The exact persistence contract is documented in `knowledge-shorts-contract.md`. The integration suite can
verify either the repository-created test database or, when explicitly enabled, the deployed Supabase contract.
No provider calls occur in contract verification.

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy src/recallstack
uv run pytest
```

For deployed-contract verification:

```powershell
$env:RUN_KNOWLEDGE_CONTRACT_TESTS='1'
uv run pytest tests/integration/test_knowledge.py -q
```

## Performance notes

A populated feed page uses bounded preference/source reads, one ranked story/source/state query, and one
batched topics query. Query count is independent of page size. There is no OFFSET pagination, per-story
query loop, raw-event aggregation, model/provider call, image processing, or storage write on the hot path.
The browser receives direct R2/CDN URLs. Benchmark P50/P95 with the production seven-day corpus before
adding Redis or any additional caching layer.
