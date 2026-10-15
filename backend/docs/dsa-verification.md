# DSA implementation and verification

Verified on 2026-10-15 with Python 3.12 and the repository's locked dependencies.
The API contract is in [dsa-api-contract.md](dsa-api-contract.md) and the portable OpenAPI
snapshot is [dsa-openapi.json](dsa-openapi.json).

## Delivered

All 18 specified operations are registered under `/api/v1/dsa`: catalog, details, public
fixtures, categories, topics, capabilities, three progress operations, three bookmark
operations, four note operations, practice history and statistics.

The module reuses Supabase JWT/profile/role resolution, the shared SQLAlchemy pool,
request tracing, error handlers, existing FastAPI startup and existing learning services.
Every learner write delegates to the existing learning repository's write logic, retaining
status transitions, optimistic concurrency, activity events, sync counters, sync change
logs and note soft deletion. Existing public routes and response schemas remain in place.
DSA delete response headers are exposed through CORS without changing the allowed origins.

Five mappings describe the existing externally managed DSA tables: definitions, versions,
suites, test cases and runtimes. They use separate metadata for read mappings and test-only
DDL, rather than extending the production Alembic target. No production migration exists
in this change. A clean Alembic-only development database does not yet contain the externally
managed DSA tables; fixture reconciliation is restricted to a separate local disposable database.

## Changed files

Modified:

- `src/recallstack/main.py`: composition, router registration, DSA cache middleware and CORS response headers.
- `README.md`: DSA capability description and documentation links.

Created:

```text
src/recallstack/composition/dsa.py
src/recallstack/modules/dsa/__init__.py
src/recallstack/modules/dsa/application/__init__.py
src/recallstack/modules/dsa/application/cursor.py
src/recallstack/modules/dsa/application/services.py
src/recallstack/modules/dsa/infrastructure/__init__.py
src/recallstack/modules/dsa/infrastructure/sqlalchemy_models.py
src/recallstack/modules/dsa/infrastructure/repositories.py
src/recallstack/modules/dsa/infrastructure/learning_repository.py
src/recallstack/modules/dsa/presentation/__init__.py
src/recallstack/modules/dsa/presentation/dependencies.py
src/recallstack/modules/dsa/presentation/middleware.py
src/recallstack/modules/dsa/presentation/routes.py
src/recallstack/modules/dsa/presentation/schemas.py
tests/dsa/__init__.py
tests/dsa/conftest.py
tests/dsa/test_api.py
tests/dsa/test_integration.py
scripts/export_dsa_openapi.py
scripts/run_postgres_tests.py
scripts/smoke_dsa.py
docs/dsa-api-contract.md
docs/dsa-openapi.json
docs/dsa-verification.md
```

## Final test results

| Check | Result |
|---|---|
| Ruff lint | Passed |
| Ruff formatting | DSA/changed files passed; existing upstream Knowledge test formatting issue after main sync |
| Strict mypy | Passed, 211 source files |
| Unit/API suite | 218 passed, 56 integration tests deselected |
| PostgreSQL integration suite | 56 passed, 218 non-integration tests deselected |
| DSA coverage within those suites | 39 unit/API tests and 10 PostgreSQL tests passed |
| Existing API compatibility | Existing routes retained; existing PostgreSQL and unit suites passed |
| OpenAPI | 18 operations, 14 paths, 32 referenced schemas exported |

PostgreSQL tests ran against a disposable local PostgreSQL 17.6 cluster. DSA tests create
their own database within that cluster, migrate it using existing Alembic migrations, and
add the externally managed DSA schema only there. The database and cluster are removed on
completion. Docker Desktop's engine was unavailable, so the native PostgreSQL runner was used.

Before delivery, the DSA commit was applied on top of `origin/main` at `63b83c8` and the
backend checks were repeated. Full-backend formatting reports
`tests/integration/test_knowledge.py`, which is unchanged from that upstream commit.
All DSA source, tests, composition, scripts and application-entry-point formatting passes.
The upstream file was retained without an unrelated formatting edit.

The final suites were run in separate processes, matching `.github/workflows/backend-ci.yml`.
An earlier combined invocation exposed an existing test-order issue: Alembic's current
`fileConfig` disables the Knowledge ingestion logger, so its later `caplog` assertion fails.
This was reproduced by checking the logger's disabled state before/after the existing Alembic
logging configuration. Both separated suites pass. Unrelated Knowledge/Alembic code was left
unchanged. An initial temporary cluster also exhausted the system drive; the runner now keeps
both cluster data and pytest temporary files under the workspace's `.pytest_cache` directory.

## Live read checks and measured latency

The read-only smoke check against the existing configured Supabase catalog passed. It
confirmed an empty learner catalog, working preview projection, zero returned verified
public cases for the selected imported draft, and successful `ProblemDetail` DTO validation
for all 375 imported draft problems. At most four reads ran concurrently during that mapping
validation. No production profile provisioning, learner write, DDL or approval update occurred.

The following p95 values use 20 sequential samples per operation with inclusive sample
quantiles. They are limited measurements, not a load test or production SLO claim.

| Operation | Local ASGI + disposable PostgreSQL | Service + live Supabase |
|---|---:|---:|
| Catalog | 40.26 ms | 246.32 ms (empty approved catalog) |
| Problem detail | 26.99 ms (approved test fixture) | 269.51 ms (authorized internal draft preview) |
| Progress GET | 9.65 ms | Not measured against production learner data |

Local ASGI measurements include the application and loopback PostgreSQL queries but replace
the authenticated identity provider. Live measurements include the service/database path
but exclude HTTP transport, JWT verification and the client-to-service network. The under
500 ms production p95 targets for catalog, detail and learner state remain unverified under
real deployment traffic, authenticated requests and load.

## Security and synchronization evidence

- Anonymous learner routes return 401; explicit preview requires administrator/reviewer roles.
- Unapproved, string-approved, missing-pointer, foreign-version, other-domain and archived
  problems fail the public specification gate. Approved base content alone is insufficient.
- Public fixtures exclude hidden/pending/rejected cases in SQL; unapproved latest suites
  cannot trigger fallback to older suites or examples.
- Public contract/example DTOs exclude reference implementations, private provenance and
  reviewer data. Reserved internal keys are removed recursively from public JSON data.
- Domain/owner checks precede note writes in the existing learning transaction. Tests cover
  attempts to mutate another user's note or another domain's note.
- Progress tests verify invalid transitions, 409 conflicts, partial updates and shared-state
  compatibility with existing APIs. PostgreSQL tests assert sync-log increments for writes.
- Bookmark duplicates do not add activity/sync entries. Notes preserve multiple entries,
  row versions and soft deletion. History/statistics exclude other owners and domains.
- Malformed cursors, cross-filter/user cursor reuse, invalid UUIDs, oversized pagination,
  invalid confidence and naive/reversed timestamp bounds are rejected.
- Dependency failures return safe 503 responses; unexpected errors use the existing safe
  500 handler. All DSA responses retain `private, no-store`, including handled errors.
- DSA transactions normalize timestamps to UTC without changing server configuration.
- No RLS policy or database permission was changed; existing application authorization and
  database credentials remain the boundaries used by the shared connection pool.

## Reproduce

Run these commands from `backend/` using the existing backend configuration:

```powershell
uv sync --frozen
uv run --frozen ruff check .
uv run --frozen ruff format --check .
uv run --frozen mypy src/recallstack
uv run --frozen pytest -m "not integration" -q --basetemp=.pytest_cache/unit-final
uv run --frozen python scripts/run_postgres_tests.py --postgres-bin .pytest_cache/postgres-tools/pgsql/bin -m integration -q -o junit_family=xunit1 --junitxml=.pytest_cache/backend-integration.xml
uv run --frozen python scripts/export_dsa_openapi.py
uv run --frozen python scripts/smoke_dsa.py --preview --validate-previews --samples 20
```

The PostgreSQL binary path above is present in this workspace's ignored test cache. On another
machine, supply its installed PostgreSQL `bin` directory instead. The runner downloads nothing,
creates no service, binds only to loopback on a temporary port, and changes only existing test
switches in its child process. It never edits `.env` or persistent environment configuration.
With a working Docker engine, the repository's existing `RUN_INTEGRATION_TESTS=1` testcontainers
setup is also supported; DSA fixture DDL rejects remote database hosts.

The smoke script uses the existing configured database URL and read-only transactions. It
never enters profile provisioning or learner write paths. `--validate-previews` validates
draft DTOs through internal service calls with at most four concurrent reads; it does not
grant HTTP preview access or publish any content.

## Remaining work and restrictions

Production editorial approval remains outstanding. The APIs are implemented, but the learner
specification catalog correctly remains empty until valid current pointers, published statuses
and the existing approval metadata are set by a separate authorized workflow. Verified public
fixtures also require an independently published suite and verified candidate cases.

Sandbox execution, compilation, submission judging, ConTree, AI tutoring, React UI and Flutter
UI are intentionally excluded. Capability responses report execution and AI tutoring as false.
No environment settings, deployment configuration, secrets, dependencies, production schemas,
review flags, catalog records, production user data, frontend or mobile files were changed.
