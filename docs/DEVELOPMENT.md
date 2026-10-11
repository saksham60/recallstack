# ReasonAI — Development and Verification

The original installation, environment configuration, and verification instructions are preserved below. For the judging overview, visit the [root README](../README.md); for the systems architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Local development

### Prerequisites

- Node.js 22+
- Python 3.12
- [`uv`](https://docs.astral.sh/uv/)
- Docker
- Go 1.27+ for Live Share
- Flutter SDK for the mobile client

### 1. Start the backend

```bash
cd backend
cp .env.example .env
docker compose up -d postgres
uv sync --frozen
uv run alembic upgrade head
uv run python -m recallstack.commands.seed
uv run uvicorn recallstack.main:app --reload --port 8080
```

### 2. Start realtime collaboration

```bash
cd realtime
cp .env.example .env
PORT=8081 ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/server
```

### 3. Start the web app

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

### 4. Run the mobile app

Configure `API_BASE_URL`, `WEB_BASE_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` using the mobile environment or `--dart-define`, then run the Flutter target normally.

On PowerShell, use `Copy-Item` instead of `cp` and set shell environment variables with `$env:NAME="value"`.

---

## Core environment configuration

Use your own credentials. Never commit populated environment files.

```dotenv
# web/.env.local — browser-visible configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_REALTIME_BASE_URL=http://localhost:8081
SYSTEM_DESIGN_ENABLED=1

# web/.env.local — server-only ReasonAI configuration
NEBIUS_API_KEY=YOUR_NEBIUS_API_KEY
TAVILY_API_KEY=YOUR_TAVILY_API_KEY
REASONAI_MODEL=nvidia/nemotron-3-super-120b-a12b
REASONAI_BASE_URL=https://api.tokenfactory.nebius.com/v1
REASONAI_V2_MODE=off          # off | dsa | system_design | all
REASONAI_MEMORY_MODE=off      # off | dsa | all

# backend/.env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE
SUPABASE_PROJECT_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_JWT_ISSUER=https://YOUR_PROJECT_REF.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_JWKS_URL=https://YOUR_PROJECT_REF.supabase.co/auth/v1/.well-known/jwks.json
CORS_ALLOWED_ORIGINS=http://localhost:3000

# realtime/.env
PORT=8081
ALLOWED_ORIGINS=http://localhost:3000
```

Knowledge API/job and R2-specific variables are documented in [`backend/docs/knowledge-shorts.md`](../backend/docs/knowledge-shorts.md).

Hackathon judge access is configured only in the deployment environment with `DEMO_ACCESS_ENABLED`, `DEMO_EMAIL` and `DEMO_PASSWORD`. Do not commit their populated values.

---

## Verification

### Web

```bash
cd web
npm run typecheck
npm run lint
npm run build
npm run verify
```

### Backend

```bash
cd backend
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
```

### Realtime

```bash
cd realtime
go vet ./...
go test ./...
go test -race ./...
go build ./cmd/server
```

### Mobile

Use the Flutter analyzer/test/build workflow from `mobile/` and the repository's mobile CI.

The repository includes focused coverage for authentication, ReasonAI agent/tool contracts, persistent conversation lifecycle, DSA visuals, System Design proposals/analysis, Knowledge feed behavior, realtime ordering/deduplication/replay, backend schema/integration behavior and mobile local-state behavior.

---

