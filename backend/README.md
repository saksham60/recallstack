# RecallStack backend

Python 3.12 FastAPI modular monolith using standard PostgreSQL, SQLAlchemy 2, psycopg 3, and Alembic.
Supabase is isolated to the JWT verifier and the identity migration’s `profiles -> auth.users` foreign
key; runtime persistence never uses the Supabase SDK or PostgREST.

## Local setup

Prerequisites: Python 3.12, `uv`, and Docker.

```bash
cp .env.example .env
docker compose up -d postgres
uv sync --frozen
uv run alembic upgrade head
uv run python -m recallstack.commands.seed
uv run uvicorn recallstack.main:app --reload --port 8080
```

Compose initializes a minimal local `auth.users` principal table so the approved profile foreign key can
be migrated without Supabase. If the database volume predates this setup, run
`docker compose down -v` once before `docker compose up -d postgres`.

For PowerShell, use `Copy-Item .env.example .env`. The example configuration connects to the Compose
database. Replace the Supabase project/auth URLs with the configured project before testing bearer
tokens. `DATABASE_URL` accepts standard `postgresql://` URLs and normalizes them to psycopg internally.

Configuration:

- `APP_ENV`
- `PORT`
- `DATABASE_URL`
- `DATABASE_POOL_SIZE`
- `DATABASE_MAX_OVERFLOW`
- `DATABASE_POOL_TIMEOUT`
- `DATABASE_POOL_RECYCLE`
- `DATABASE_POOL_PRE_PING`
- `SUPABASE_PROJECT_URL`
- `SUPABASE_JWT_ISSUER`
- `SUPABASE_JWT_AUDIENCE`
- `SUPABASE_JWKS_URL`
- `LOG_LEVEL`
- `JWKS_CACHE_SECONDS`
- `REQUEST_BODY_MAX_BYTES`
- `READINESS_CACHE_SECONDS`
- `SYNC_RETENTION_DAYS`
- `CORS_ALLOWED_ORIGINS` (comma-separated origins; currently `*` with cookie credentials disabled)

For Cloud Run with the Supabase session pooler, start conservatively with pool size `2`, overflow `3`,
timeout `30`, recycle `1800`, and pre-ping enabled. Total possible PostgreSQL connections are
`(pool size + overflow) × maximum Cloud Run instances`; keep that bound below the provider limit.
Wildcard CORS is currently an explicit pre-UI-development choice. Replace it with the exact staging and
production UI origins before accepting browser traffic from an untrusted public client.

Never commit `.env`. `SUPABASE_KEY` is not required by the backend and is not consumed.

## API

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/me`
- `PATCH /api/v1/me`
- `GET /api/v1/domains/{domainSlug}/categories`
- `GET /api/v1/categories/{categoryId}/content`
- `GET /api/v1/content/{slug}`
- `GET /api/v1/me/progress`
- `GET /api/v1/me/progress/{contentId}` / `PUT /api/v1/me/progress/{contentId}`
- `GET /api/v1/me/bookmarks` / `PUT|DELETE /api/v1/me/bookmarks/{contentId}`
- `GET /api/v1/me/notes`
- `GET /api/v1/me/content/{contentId}/notes`
- `POST /api/v1/me/notes` / `PATCH|DELETE /api/v1/me/notes/{noteId}`
- `POST /api/v1/practice/attempts`
- `GET /api/v1/me/reviews/due`
- `POST /api/v1/me/reviews/{cardId}/submit`
- `GET /api/v1/me/reviews/history`
- `GET /api/v1/search`
- `POST /api/v1/admin/content`
- `GET|POST /api/v1/admin/content/{contentId}/versions`
- `PUT /api/v1/admin/content-versions/{versionId}/document`
- `PUT /api/v1/admin/content/{contentId}/practice-resources`
- `POST /api/v1/admin/content-versions/{versionId}/submit-review`
- `POST /api/v1/admin/content-versions/{versionId}/return-draft`
- `POST /api/v1/admin/content-versions/{versionId}/publish`
- `POST /api/v1/admin/content/{contentId}/archive`
- `GET /api/v1/admin/users` / `GET /api/v1/admin/users/{userId}`
- `GET /api/v1/admin/users/{userId}/progress`
- `GET /api/v1/admin/users/{userId}/practice-attempts`
- `GET /api/v1/admin/users/{userId}/reviews`
- `GET|POST /api/v1/admin/users/{userId}/roles`
- `POST /api/v1/admin/users/{userId}/roles/{roleId}/revoke`
- `POST /api/v1/devices/register` / `GET /api/v1/me/devices`
- `POST /api/v1/devices/{deviceId}/revoke`
- `POST /api/v1/sync/mutations` / `POST /api/v1/sync/mutations/batch`
- `GET /api/v1/sync/user?device_id={deviceId}&after={cursor}`
- `GET /api/v1/sync/catalog/{domainId}?device_id={deviceId}&after={cursor}`

Authenticated calls use `Authorization: Bearer <Supabase access token>`. User identity is always the
verified JWT subject and is never accepted from request JSON or query parameters.

The category dashboard is unpaginated because categories are a bounded, administrator-curated domain
taxonomy. It reports direct category assignments; nested child content is not rolled into parents.
See `docs/schema.md` for progress semantics and PostgreSQL-specific integrity choices.

The category content list is paginated (`page`, `page_size`, maximum 100) because content within a
category is not bounded. It returns only direct assignments to the requested category; it does not
implicitly include a nested category's descendants. Supported filters are `type`, `difficulty`,
`status`, `topic`, and `search`; supported sorts are `sort_order`, `title`, `difficulty`, and
`updated_at`. Results include only an item's current published version and user-specific state for the
verified profile.

The published study-note endpoint resolves only the current published version and records a
server-generated `content_opened` activity event. Its response includes a weak ETag based on the stable
content ID and published version number; it is marked `private, no-cache` because the response also
contains the authenticated user's progress, bookmark, and review-card state.
`If-None-Match` deliberately does not produce `304` yet: an ETag containing only the published version
cannot represent mutable private learner state. The endpoint favors correctness until content and
private state are split into separate cacheable representations.

Learning writes derive the profile from the verified bearer token. Progress creation uses `row_version: 0`;
every subsequent progress write and every note update/delete must provide the latest `row_version`.
Stale writes return `409 Conflict`, notes are soft-deleted, and bookmark PUT/DELETE operations are
idempotent.
New learner writes require an active item with a valid current published version. Existing user history
is preserved after archival, but archived or unpublished content rejects new progress, bookmark-add,
and note-create commands.

Practice attempts are submitted as one transaction using a client-generated `attempt_event_id` for safe
retry deduplication. The v1 deterministic initial-review scheduler is behind an application interface so
FSRS can replace it later. The API spelling `understood_but_could_not_code` maps to the approved database
enum value `understood_not_coded`; application code remains independent of that persistence detail.
The immutable attempt row stores its original result snapshot, so later aggregate changes cannot alter
an old retry response. Practice uses a monotonic learning-state policy and cannot implicitly downgrade
`mastered`.

Recall submissions use a client-generated `review_event_id` and an `expected_row_version`. A normal
review updates the card only through the submit command, appends immutable history, and records the
scheduler name/version plus previous and next scheduling values in the same transaction.

Admin content authoring follows `draft -> in_review -> published`. Administrators and content editors
may create content, edit drafts, manage taxonomy mappings and practice resources, and submit review.
Only administrators may publish, return an in-review version to draft, or archive a content item.
Published versions and their block composition are immutable; a subsequent edit starts a new draft
version cloned from the current published version.
Categories and topics are version-owned: draft taxonomy remains invisible until publication atomically
switches the public document and its taxonomy. Legacy item mappings are maintained only as a temporary
publish-time compatibility projection.

Practice-resource replacement is an atomic set operation. Clients send `expected_revision`, keep IDs
for resources they intend to update, omit active resources they intend to archive, and receive the new
revision. Provider IDs are positive JSON integers backed by PostgreSQL `SMALLINT`. URLs must use HTTPS
and are normalized and hashed by the server. The database never hard-deletes historical resources.

Version listing is paginated and includes workflow history. Draft document updates and workflow
transitions require `expected_row_version`; stale or concurrent writes return `409 Conflict`. Publishing
sets `reviewed_by`, `published_by`, and `published_at`, changes the stable content item's current
published-version pointer, refreshes its PostgreSQL search document, writes status history, and emits a
catalog-change event after the single database commit.

Admin user inspection is administrator-only and every collection is paginated with a maximum page size
of 100. User-list filters support progress state and inclusive activity date bounds. Progress,
practice-attempt, and review history endpoints support inclusive activity date bounds as well. Responses
contain application profile IDs and operational learning data only; they never query or return
`auth.*` credentials, auth subjects, email addresses, access tokens, or refresh tokens. Role grants are
an audited history: granting and revoking lock the target profile, record the acting administrator and
timestamp, and never delete a prior grant row. Repeated grant/revoke requests are idempotent and return
`changed: false` when the requested state already exists.
Admin-role changes are serialized in PostgreSQL; revoking the final active administrator returns `409`.

Offline sync supports progress, bookmarks, private notes, practice attempts, and review submissions.
Every mutation is associated with an active device owned by the authenticated profile; user identity is
never accepted in the mutation body. `mutation_id` and a server-calculated canonical request hash make
retries safe and reject reuse with changed content. The sync adapter invokes the same Learning,
Practice, and Recall application services as the online routes inside one outer transaction, then
allocates a strictly ordered per-user cursor and commits once. Catalog data remains server authoritative.
The ledger persists the original cursor and result payload, so applied and rejected retries remain
stable throughout the retention window.

Batch sync uses one transaction per mutation. Business-rule conflicts are returned as rejected batch
items while valid siblings remain committed; invalid device ownership rejects the request. Pull feeds
are bounded to 500 entries and require `device_id` because retention state is device-specific. The
default `SYNC_RETENTION_DAYS=30` bounds both the mutation ledger and change logs. Run the following as a
scheduled Cloud Run Job; devices that fall behind deleted changes receive
`full_resync_required: true`:

```bash
uv run python -m recallstack.commands.compact_sync
```

## Initial administrator

The user must authenticate once so the application profile exists. Then grant the role using the
management command and a migration/operations credential:

```bash
uv run python -m recallstack.commands.grant_role PROFILE_UUID admin
```

The command writes `profile_role_grants`; no email address is hard-coded.

## Ultimate DSA workbook import

The source workbook remains under the Git-ignored `data/` directory. Seed catalog references first,
then run the importer without `--apply`; dry-run is the default and performs no writes:

```powershell
uv run python -m recallstack.commands.seed
uv run python -m recallstack.commands.import_dsa_workbook "..\data\DS Algo\Ultimate DSA.xlsx" --report .\dsa-import-report.json
```

Review the counts, repeated titles/URLs, and errors. To publish through the normal audited admin
workflow, pass an existing active admin profile explicitly:

```powershell
uv run python -m recallstack.commands.import_dsa_workbook "..\data\DS Algo\Ultimate DSA.xlsx" --apply --actor-profile-id PROFILE_UUID --report .\dsa-import-applied.json
```

The importer uses stable source-index slugs and fingerprints, so retries do not duplicate already
published rows. Every problem uses one outer PostgreSQL transaction through the same admin services; a
failure leaves the prior published state unchanged. See `docs/dsa-workbook-import.md` for the approved
mapping and rollback procedure.

## Verification

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv export --frozen --no-dev --no-emit-project -o .audit-requirements.txt
uv run pip-audit -r .audit-requirements.txt
```

Real PostgreSQL integration/schema tests use Testcontainers:

```bash
RUN_INTEGRATION_TESTS=1 uv run pytest
```

On PowerShell: `$env:RUN_INTEGRATION_TESTS='1'`. CI runs the same suite.

## Docker and deployment

```bash
docker build -t recallstack-backend .
docker run --rm -p 8080:8080 --env-file .env recallstack-backend
```

The image runs as a non-root user, honors Cloud Run’s `PORT`, and uses `exec` so Uvicorn receives
SIGTERM. Run `alembic upgrade head` as a separate release job with migration credentials; do not run
migrations concurrently in every web instance. Keep the runtime role least-privileged and separate from
the schema owner.

The container disables Uvicorn proxy-header trust. Cloud Run routing does not require trusting arbitrary
client-supplied forwarded headers for RecallStack's authorization or URL generation.

OpenTelemetry remains behind `OTEL_ENABLED` until an exporter/collector is selected.

Redis / Memorystore caching is intentionally deferred. PostgreSQL remains the source of truth and no
cache infrastructure is required at current scale; add caching only after measured PostgreSQL load and
latency justify the operational cost.
