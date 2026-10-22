# ReasonAI Backend

<p align="center">
  <strong>Build Better Engineering Judgment — On a Deterministic Foundation.</strong>
</p>

<p align="center">
  <strong>Verify identity. Enforce state. Deliver evidence.</strong><br/>
  A Python/FastAPI domain backend for versioned engineering content, learning progress, revision, persisted System Design diagrams, prepared Knowledge, synchronization and administration.
</p>

<p align="center">
  <a href="https://www.reasonai.tech/login"><strong>Explore ReasonAI</strong></a> &nbsp;·&nbsp;
  <a href="docs/ENGINEERING_REFERENCE.md"><strong>Engineering Deep Dive</strong></a> &nbsp;·&nbsp;
  <a href="docs/knowledge-shorts.md">Knowledge Pipeline</a> &nbsp;·&nbsp;
  <a href="../docs/ARCHITECTURE.md">Full Architecture</a>
</p>

---

### The authoritative domain layer behind ReasonAI

<picture>
  <source media="(max-width: 767px)" srcset="docs/assets/reasonai-backend-overview-mobile.svg">
  <img src="docs/assets/reasonai-backend-overview.svg" alt="Backend architecture showing FastAPI authenticated requests, domain services, Supabase PostgreSQL, Knowledge refresh and adjacent execution services">
</picture>

**FastAPI owns durable product state. Next.js owns interactive AI and DSA judging orchestration. Go owns ephemeral collaboration.**

The backend is a **Python 3.12 modular monolith** using **FastAPI, Pydantic, SQLAlchemy 2, psycopg 3 and PostgreSQL** (production: Supabase PostgreSQL). It handles authenticated learning, publication, diagrams, Knowledge serving, administration and sync with testable, transactional rules.

The **separate Knowledge Cloud Run Job** uses **Tavily** and **Hacker News** discovery, structured **NVIDIA Nemotron** enrichment through **Nebius Token Factory**, and **Cloudflare R2** media storage. The regular feed API serves prepared stories without running inference on each scroll.

<details>
<summary><strong>Expand the complete backend architecture</strong></summary>

![Detailed backend architecture with product modules, Knowledge refresh, auth and runtime boundaries](docs/assets/reasonai-backend-architecture.svg)

[Open the full-resolution architecture SVG →](docs/assets/reasonai-backend-architecture.svg)

[Full backend engineering reference →](docs/ENGINEERING_REFERENCE.md) · [Web orchestration →](../web/README.md) · [Mobile →](../mobile/README.md) · [Go Live Share →](../realtime/README.md)
</details>

## Three backend workflows: serve, enrich, synchronize

<picture>
  <source media="(max-width: 767px)" srcset="docs/assets/reasonai-backend-workflows-mobile.svg">
  <img src="docs/assets/reasonai-backend-workflows.svg" alt="Backend workflows for authenticated transactions, offline Nemotron Knowledge enrichment and idempotent device synchronization">
</picture>

### 01 · Serve verified, deterministic product APIs

**Supabase JWT → FastAPI/Pydantic → domain application service → SQLAlchemy Unit of Work → PostgreSQL.**

Web and mobile requests use the authenticated Supabase subject to derive the effective application profile and permissions. The backend does **not** trust a user ID supplied in a client body. It owns versioned DSA publication, progress, notes and bookmarks; practice and scheduled revision; saved diagrams; Knowledge preferences/events; search; and administrator workflows.

Application services apply domain rules through request-scoped transactions instead of embedding unchecked SQL in route handlers. Persistent learner state stays authoritative even when external AI services are unavailable.

[FastAPI composition →](src/recallstack/main.py) · [Data/transaction model →](docs/schema.md) · [DSA API contract →](docs/dsa-api-contract.md)

### 02 · Produce Knowledge offline, serve it efficiently

**Cloud Run refresh job → PostgreSQL advisory lock → Tavily/Hacker News discovery → content and image gates → Nemotron enrichment → R2 + PostgreSQL → prepared feed.**

The separate Knowledge job deduplicates and validates candidates before spending model tokens. It rejects unsuitable content/images, processes valid images into WebP, requests structured **Nemotron** enrichment, uploads image assets to **R2**, and commits approved story metadata and topics in a short transaction.

The online `GET /api/v1/knowledge/feed` path uses a **deterministic PostgreSQL ranking** of stored articles, explicit user interests, quality and freshness. Pagination uses signed, user-scoped cursors; feed scrolling does not trigger Tavily or Nemotron inference.

[Knowledge API, ranking and refresh contract →](docs/knowledge-shorts.md) · [Refresh job source →](src/recallstack/modules/knowledge/jobs/refresh.py)

### 03 · Synchronize without corrupting learner history

**Registered device → ownership and mutation validation → request hash/idempotency → atomic ledger and change cursor → incremental pull or full-resync snapshot/ACK.**

The backend supports device-scoped offline mutations for supported learner entities, duplicate-safe replay and conflict detection. Retention-aware user/catalog cursors allow incremental changes; a device that falls behind can perform a bounded snapshot/resync, then explicitly acknowledge the applied snapshot before continuing.

**Important scope boundary:** the *server-side* sync protocol exists, but full offline mutation queuing and snapshot reconciliation are **not yet connected end-to-end in Flutter**.

[Sync service →](src/recallstack/modules/sync/application/sync_service.py) · [Mobile state ownership →](../mobile/README.md)

---

## What the backend owns

| Domain | Authoritative backend responsibility |
| --- | --- |
| **Identity and security** | Verify Supabase access tokens, project profiles/roles, enforce owner and admin authorization |
| **DSA and learning** | Published problems, content/versioning, progress, bookmarks, private notes, practice attempts and reviews |
| **Diagram persistence** | Owner-scoped System Design snapshots with optimistic revision checks |
| **Knowledge online** | Deterministic feed ranking, signed cursors, stories, event projections, preferences and refresh requests |
| **Knowledge offline** | Tavily/HN discovery, quality gates, Nemotron enrichment, R2 images and stored topics |
| **Device synchronization** | Registration, idempotent mutations, change ledgers, retention and full-resync snapshots |
| **Administration** | Publication lifecycle, roles, user inspection, analytics and safe audit-facing operations |
| **Platform** | Health/readiness, request IDs, logging, SQL timing, bounded request processing and structured errors |

**Explicitly outside FastAPI:** interactive **Next.js/LangGraph agents**, live ReasonAI NDJSON chat, server-side conversation/learner-memory runtime, **Vercel Queue → Nebius ConTree → trusted DSA judge**, and the **Go WebSocket** room service. The backend does not fine-tune Nemotron weights.

<details>
<summary><strong>Read the precise consistency and trust guarantees</strong></summary>

| Boundary | Implemented mechanism |
| --- | --- |
| **Authentication** | JWT signature, issuer and audience verification from Supabase JWKS; ownership resolved server-side |
| **Persistence** | SQLAlchemy Unit of Work transactions; versioned DSA publication; immutable/idempotent history where required |
| **Knowledge ranking** | Deterministic weighted importance, story/source quality, explicit preferences and freshness; no per-read LLM reranking |
| **Feed pagination** | Profile/topic/source-scoped HMAC cursor; anchored ordering; one-hour validity |
| **Knowledge interaction events** | Event ID deduplication; SAVE/UNSAVE and HIDE/UNHIDE projections tolerate out-of-order delivery |
| **Diagrams** | Optimistic document revisions in PostgreSQL; live room state remains in the separate Go service |
| **Sync** | Canonical mutation hashes and idempotent result replay; per-user change cursors; snapshot ACK protocol |
| **Observability** | Structured request/SQL logs, request/trace IDs and readiness; full tracing/exporter deployment is a separate concern |

[Data invariants and concurrency details →](docs/ENGINEERING_REFERENCE.md) · [Knowledge exact contract →](docs/knowledge-shorts-contract.md)
</details>

## Run FastAPI locally

**Prerequisites:** Python **3.12**, [uv](https://docs.astral.sh/uv/), Docker, and access to a Supabase Auth project for authenticated requests.

**1. Clone and create the backend environment** (Bash / Git Bash):

```bash
git clone https://github.com/saksham60/recallstack.git && cd recallstack/backend && cp .env.example .env
```

**2. Update `backend/.env`**. The example's database URL references a remote Supabase pooler; replace it with the included Compose database:

```dotenv
DATABASE_URL=postgresql+psycopg://recallstack:recallstack-local@localhost:5432/recallstack
SUPABASE_PROJECT_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_JWT_ISSUER=https://YOUR_PROJECT_REF.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_JWKS_URL=https://YOUR_PROJECT_REF.supabase.co/auth/v1/.well-known/jwks.json
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

For prepared Knowledge Feed serving, enable `KNOWLEDGE_ENABLED=true` only after the schema is migrated, with a random `KNOWLEDGE_CURSOR_SECRET` of **at least 32 characters**. The online API does not need Nebius, Tavily, or R2 write credentials.

**3. Start the database, migrate, seed and serve:**

```bash
docker compose up -d --wait postgres
uv sync --frozen
uv run alembic upgrade head
uv run python -m recallstack.commands.seed
uv run uvicorn recallstack.main:app --reload --port 8080
```

**4. Verify liveness and database readiness:**

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

The Compose database includes the minimal `auth.users` compatibility required for local migrations; it is **not a complete local Supabase Auth server**. Authenticated API requests need valid bearer tokens from the matching external Supabase Auth project.

[Local backend configuration →](docs/ENGINEERING_REFERENCE.md) · [Full-stack development guide →](../docs/DEVELOPMENT.md)

## Run Knowledge enrichment as a separate job

The refresh job is **not the serving API**. It requires Tavily, Nebius, R2 and session-compatible PostgreSQL configuration to perform the complete ingestion path.

```bash
# From backend/ — external discovery/inference may still run
uv run python -m recallstack.modules.knowledge.jobs.refresh --dry-run --limit 5
```

`--dry-run` prevents persistent DB/R2 mutations; it may still execute paid provider calls. The PostgreSQL advisory lock requires a direct or session-pooler connection, not transaction pooling.

[Full job contract →](docs/knowledge-shorts.md)

## Verify the backend

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
```

For real PostgreSQL integration tests, use `RUN_INTEGRATION_TESTS=1 uv run pytest` with Docker/Testcontainers available. Dependency auditing and deployment checks remain documented in the [engineering reference](docs/ENGINEERING_REFERENCE.md).

## What doesn't work yet — and where the boundaries stop

| Engineering boundary | Current trade-off |
| --- | --- |
| **Explicit ranking ≠ learned personalization** | Feed ranking uses preference-weighted SQL rather than a behavioral embedding model or LLM inference on each feed request. |
| **Sync server ≠ offline-first mobile product** | Backend cursor/ledger/snapshot contracts exist, but Flutter does not yet implement the complete device mutation/resync flow. |
| **Prepared feed ≠ continuous freshness** | Offline discovery and Nemotron enrichment save online inference cost, but stories can age between job runs. |
| **Durable diagrams ≠ durable Live Share rooms** | PostgreSQL owns snapshots; Go collaboration rooms are separate, memory-only and single-instance. |
| **Structured logs ≠ a full observability platform** | Request/DB diagnostics and health exist; a complete OpenTelemetry collector/exporter and SLO stack is not claimed. |

## Explore implementation and evidence

| What to inspect | Implementation |
| --- | --- |
| **FastAPI application and modular structure** | [Application entrypoint](src/recallstack/main.py) · [Complete engineering reference](docs/ENGINEERING_REFERENCE.md) |
| **Database contracts and migrations** | [Schema documentation](docs/schema.md) · [Alembic migrations](alembic/) |
| **Deterministic feed and offline Nemotron/Tavily job** | [Knowledge subsystem](docs/knowledge-shorts.md) · [Refresh command](src/recallstack/modules/knowledge/jobs/refresh.py) |
| **DSA publication and learner state** | [DSA contract](docs/dsa-api-contract.md) · [Verification](docs/dsa-verification.md) |
| **Offline sync and retention** | [Sync service](src/recallstack/modules/sync/application/sync_service.py) |
| **Authorization and administration** | [Admin contract](docs/admin-panel-backend.md) |
| **Interactive AI and ConTree judging, outside FastAPI** | [Web architecture](../web/README.md) · [Sandbox adapter](../web/src/lib/dsa-execution/contree.ts) |
| **Whole ReasonAI architecture** | [Main README](../README.md) · [Full system topology](../docs/ARCHITECTURE.md) |

---

**ReasonAI Backend — Deterministic by Design. Evidence Before Inference.** [Live ReasonAI](https://www.reasonai.tech/login) · [Main README](../README.md) · [Engineering Reference](docs/ENGINEERING_REFERENCE.md) · [MIT License](../LICENSE)
