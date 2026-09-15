# ReasonAI

ReasonAI is an AI-powered technical-learning workspace for mastering DSA and designing distributed systems through guided reasoning, visual explanations, and live collaboration.

**Live demo:** [https://www.reasonai.tech](https://www.reasonai.tech)

## Judge access

1. Open the live demo.
2. Click **Continue as Hackathon Judge**.
3. Start exploring immediately; no account setup is required.

## What judges can try

- **AI-guided DSA learning:** ask for hints, explanations, reviews, complexity analysis, or help tied to a practice problem.
- **Visual DSA explanations:** generate interactive array, pointer, graph, tree, matrix, and dynamic-programming walkthroughs.
- **AI-assisted System Design:** discuss the active architecture in Chat, Review, Fix, or Eagle View modes.
- **Architecture analysis and review:** highlight bottlenecks, failure impact, capacity, reliability, traffic, and cost reasoning directly on the canvas.
- **Draggable AI-generated architecture suggestions:** review each proposed component or connection before dropping or accepting it on the canvas.
- **Live collaborative canvas:** share a capability link or QR code and collaborate with synchronized structure, movement previews, cursors, and presence.
- **Tavily-grounded research:** retrieve current or source-specific evidence and show links alongside grounded AI responses.

## Hackathon stack

| Technology | Role in ReasonAI |
| --- | --- |
| **NVIDIA Nemotron** | Powers the DSA tutor, structured visual lessons, System Design conversations, semantic architecture analysis, and reviewable canvas suggestions. |
| **Nebius Token Factory** | Hosts the OpenAI-compatible inference endpoint through which the server invokes the configured NVIDIA Nemotron model. Credentials remain server-side. |
| **Tavily** | Extracts and searches linked DSA pages, researches current System Design facts, and supplies bounded evidence for sourced responses. |
| **Next.js** | Provides the web experience and authenticated server routes for ReasonAI orchestration. |
| **Supabase** | Provides authentication and PostgreSQL-backed application data. |
| **Go realtime service** | Runs temporary collaboration rooms, ordered operations, bounded replay, presence, cursors, and ephemeral canvas updates over WebSockets. |

Nemotron is the reasoning engine behind both learning surfaces. For DSA, it adapts hints and explanations to the learner's current problem and can return a validated visual-lesson contract. For System Design, it reasons over the current diagram, returns semantic overlays, and can propose individually reviewable canvas operations.

Nebius Token Factory is the model-serving layer. Next.js server routes call its OpenAI-compatible API using `NEBIUS_API_KEY`; the browser never receives that credential.

Tavily supplies external evidence only where it helps. The DSA tutor uses Tavily Extract and Search for linked-page context and explicit web searches. The System Design assistant uses Tavily for current provider capabilities, limits, pricing, and documentation. Retrieved evidence is bounded, treated as untrusted input, and surfaced as source links when Nemotron uses it.

## Architecture

```mermaid
flowchart LR
    Judge[Judge / Learner] --> Web[Next.js Web App]
    Mobile[Mobile App] --> API[FastAPI Backend]
    Web --> API
    API --> DB[(Supabase PostgreSQL)]
    Web --> Auth[Supabase Auth]
    Mobile --> Auth

    Web --> AI[ReasonAI server routes]
    AI --> Tavily[Tavily Extract + Search]
    Tavily --> AI
    AI --> Nebius[Nebius Token Factory]
    Nebius --> Nemotron[NVIDIA Nemotron]

    Web <--> RT[Go realtime service]
```

The AI and research calls run on the server. Learning data flows through the backend, while live canvas collaboration uses the separate Go WebSocket service.

## Local setup

Prerequisites: Node.js 22+, Python 3.12, [`uv`](https://docs.astral.sh/uv/), Docker, and Go 1.27+ if running Live Share locally.

1. Start the backend:

   ```bash
   cd backend
   cp .env.example .env
   # Replace the placeholder database and Supabase values as shown below.
   docker compose up -d postgres
   uv sync --frozen
   uv run alembic upgrade head
   uv run python -m recallstack.commands.seed
   uv run uvicorn recallstack.main:app --reload --port 8080
   ```

2. Optionally start the realtime service on a different local port:

   ```bash
   cd realtime
   cp .env.example .env
   PORT=8081 ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/server
   ```

3. Start the web app:

   ```bash
   cd web
   cp .env.example .env.local
   # Replace the placeholder Supabase, Nebius, and Tavily values as shown below.
   npm install
   npm run dev
   ```

   On PowerShell, use `Copy-Item` instead of `cp` and set environment variables with `$env:NAME="value"`.

### Environment variables

Use your own development credentials. The values below are placeholders; never commit populated `.env` or `.env.local` files.

```dotenv
# web/.env.local — browser-visible configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_REALTIME_BASE_URL=http://localhost:8081
SYSTEM_DESIGN_ENABLED=1

# web/.env.local — server-only AI configuration
NEBIUS_API_KEY=YOUR_NEBIUS_API_KEY
TAVILY_API_KEY=YOUR_TAVILY_API_KEY
REASONAI_MODEL=nvidia/nemotron-3-super-120b-a12b
REASONAI_BASE_URL=https://api.tokenfactory.nebius.com/v1

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

Hackathon judge access is configured only in the deployment environment with `DEMO_ACCESS_ENABLED`, `DEMO_EMAIL`, and `DEMO_PASSWORD`. Do not commit their populated values.

## Significant Hackathon Updates Since Aug 26, 2026

- Added **live collaboration** through the Go WebSocket service, including room links, QR sharing, ordered operations, presence, cursors, and transient movement previews.
- Built the **ReasonAI System Design assistant** with Chat, Review, Fix, and Eagle View workflows grounded in the active canvas.
- Integrated **NVIDIA Nemotron through Nebius Token Factory** for DSA tutoring and System Design reasoning.
- Added **Tavily research** for linked DSA sources, explicit DSA search, and current System Design facts with visible citations.
- Revamped the **DSA AI tutor** with safer context boundaries, progressive help, source-aware answers, and resilient provider handling.
- Added **visual lessons** with validated step-by-step array, pointer, graph, tree, matrix, and dynamic-programming states.
- Added **architecture visualization and analysis** with temporary semantic overlays for bottlenecks, failures, capacity, reliability, traffic, and cost.
- Strengthened **authentication and session reliability** with verified Supabase tokens, bounded refresh-and-retry behavior, and clearer transient-error handling.
- Added **hackathon judge login** so reviewers can enter the hosted experience without creating an account.
- Completed **UI and branding polish** across the landing page, ReasonAI surfaces, canvas interactions, and responsive layouts.

## Privacy and security

AI and Tavily credentials stay in server-only environment variables. ReasonAI bounds and validates requests, redacts common credential patterns, treats canvas text and retrieved pages as untrusted data, and never sends private workspace history in Tavily search queries. Supabase access tokens are verified server-side, and live guest room tokens act as private capability links that should not be shared publicly.

## Testing

The repository includes TypeScript, lint, production-build, Playwright, Python, database-integration, and Go tests. The principal checks are:

```bash
cd web && npm run verify
cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy && uv run pytest
cd realtime && go test ./...
```

See [`web/README.md`](web/README.md), [`backend/README.md`](backend/README.md), and [`realtime/README.md`](realtime/README.md) for component-specific setup and operational limits.
