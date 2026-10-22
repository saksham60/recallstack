# ReasonAI

**Build Better Engineering Judgment.**

Passing visible tests does not prove an algorithm correct. Drawing an architecture does not expose every bottleneck. And receiving an AI answer is not the same as testing it.

**ReasonAI brings executable DSA evidence, an editable multiplayer System Design canvas, and NVIDIA Nemotron reasoning on Nebius into one engineering workbench.** Developers can run code, submit it to isolated judging, explore architectural trade-offs, and turn AI suggestions into reviewed changes.

[**Launch ReasonAI — Judge Access**](https://www.reasonai.tech/login) · [**Watch the Hackathon Demo**](https://www.youtube.com/watch?v=FoV2KkK72Xs) · [**Devpost Submission**](https://devpost.com/software/reasonai) · [**Full Architecture**](docs/ARCHITECTURE.md)

---

### Architecture first: where deterministic execution ends and AI reasoning begins

![ReasonAI architecture: Next.js and Flutter clients, Pyodide local Run, Vercel Queue and Nebius ConTree sandbox Submit, trusted judge and Supabase verdicts, LangGraph agents using NVIDIA Nemotron through Nebius Token Factory, Tavily research, and Go WebSocket collaboration](docs/assets/reasonai-architecture.svg)

**A clear separation of responsibilities:**

| Deterministic systems — the source of truth | NVIDIA Nemotron — the reasoning layer | Human control — the final decision |
| --- | --- | --- |
| **Pyodide** runs public tests locally. **Nebius ConTree Sandbox** isolates Submit execution; the judge evaluates results. **Supabase/PostgreSQL** stores verdicts and conversation state. **Go WebSockets** sequence collaborative operations and support ACK/replay. Typed validators check canvas operations. | **Nebius Token Factory** serves Nemotron models. **LangGraph** coordinates tutoring, Code Intelligence, System Design analysis, and tool calls. **Tavily** supplies bounded current-source research and offline Knowledge discovery. | The engineer evaluates Code Intelligence against the execution verdict and reviews proposed architecture operations before choosing **Accept** or **Discard**. |

**The two Nebius boundaries are deliberately different:** **ConTree Sandbox executes user code**; **Token Factory runs NVIDIA Nemotron inference**. Models propose and explain. The judge, validators, persistence layer, and user-controlled canvas decide what becomes authoritative.

[Explore service boundaries, data flows, and deployment topology →](docs/ARCHITECTURE.md)

## The core loop: from plausible answers to inspectable evidence

| Engineering problem | ReasonAI workflow |
| --- | --- |
| **DSA: false confidence.** A solution passes public cases but fails on an unseen input. | **Run → Submit → Review.** Pyodide gives fast local feedback; queued **Nebius ConTree** execution evaluates private cases through the deterministic judge; the saved verdict and submission context feed **Nemotron Super Code Intelligence** and follow-up tutoring. |
| **System Design: blind spots in a diagram.** A canvas contains components and connections, but the engineer needs to reason about resilience, capacity, or trade-offs. | **Analyze → Propose → Review → Apply.** Nemotron receives bounded node/edge context, optionally calls **Tavily `search_web`** for current public facts, and returns validated architecture analysis or typed node/edge proposals. **Konva** keeps the diagram editable, and **Go Live Share** synchronizes committed changes. |
| **Knowledge: static answers age quickly.** Engineers need relevant technical developments without generating every feed card on demand. | **Discover → Enrich → Read → Research.** Offline **Tavily** discovery, deduplication, Nemotron enrichment, and storage prepare Knowledge stories. Feed reads and ranking are deterministic; story chat can invoke live `search_web` when fresh evidence matters. |

### A concrete DSA result: 9/9 locally, `wrong_answer` on Submit

A deliberately overfitted **3Sum** solution passed **9/9 public tests** in the browser. A real **Nebius ConTree Sandbox** submission returned **`wrong_answer`**, and the result was persisted with its submission history. **Nemotron Super** then generated a Code Intelligence review tied to that submission.

The distinction is central to ReasonAI: **execution establishes the verdict; the model helps explain and learn from it.**

[Inspect the real submission and Code Intelligence evidence →](docs/dsa-v3/integration-20261017.md)

### A concrete System Design result: a structured proposal, not drawing instructions

In a real product run, the System Design agent generated a **nine-operation proposal**: **five nodes** (Web Application, API Gateway, Backend Service, PostgreSQL, Redis) and **four edges**. The typed proposal passed validation and was stored as **pending** for review.

That is the product contract: **Nemotron proposes operations → validators check them → the engineer accepts or discards them → the canvas applies accepted changes.**

[Inspect the recorded proposal](docs/evidence/runs/2026-10-11/SD-LIVE-01/record.md) · [See the proposal lifecycle](web/docs/reasonai-proposal-recovery.md)

---

## Judge quickstart: try the engineering loop

**No local installation or personal account setup.** Open [ReasonAI](https://www.reasonai.tech/login) and select **Continue as Hackathon Judge**.

1. **System Design — question the diagram.** Open **System Design** and ask: `Review this architecture for a single point of failure. Identify the affected nodes and propose reviewable changes.`
2. **Human approval — inspect the diff.** Review Nemotron's proposed node/edge operations. Use **Accept** or **Discard** rather than treating AI output as an automatic diagram mutation.
3. **DSA — test beyond green local results.** Open **DSA → 3Sum**. Request a progressive hint, run public tests locally, then use **Submit** to inspect the judged result, submission history, and Code Intelligence.
4. **Collaboration and current facts.** Open a **Live Share** room in a second browser session to inspect synchronized canvas edits. Then visit a **Knowledge** story and ask about recent related technical developments to exercise Tavily-backed research.

[Watch the end-to-end product demo →](https://www.youtube.com/watch?v=FoV2KkK72Xs)

## Multi-model orchestration: Nebius Token Factory + Nemotron + Tavily

ReasonAI calls the **Nebius Token Factory** OpenAI-compatible inference API from server-side routes. In System Design, users can choose a model tier or select **Auto**, which uses a constrained **Super → Ultra** escalation path.

| Component | Actual responsibility | Implemented selection / limit |
| --- | --- | --- |
| **Nemotron Lightning** · `nvidia/Nemotron-3_5-Lightning` | Explicit lightweight model option for System Design interactions. | Selected when `modelPreference = "lightning"`. **Auto does not route to Lightning.** |
| **Nemotron Super** · `nvidia/nemotron-3-super-120b-a12b` | Default reasoning tier for ReasonAI; System Design baseline, DSA tutoring, saved Code Intelligence, and Knowledge enrichment. | Explicit `"super"` stays on Super; **Auto starts on Super**. |
| **Nemotron Ultra** · `nvidia/Nemotron-3-Ultra-550b-a55b` | Explicit deeper-reasoning tier in System Design or the destination of an approved Auto escalation. | Selected explicitly with `"ultra"` or after a single valid `escalate_reasoning` tool request. |
| **Auto routing** | Model-requested escalation with deterministic server validation. | Escalation is offered **only on the first tool round**, when preference is `auto`, tier is `super`, no canvas proposal is required, and escalation has not already occurred. |
| **`escalate_reasoning`** | Requests a Super → Ultra switch before producing the answer. | Must be the **only call** in that round, with exactly one `reason`: `architecture_tradeoff`, `conflicting_constraints`, `deep_reliability`, or `complex_synthesis`. Invalid requests are rejected. |
| **Tavily `search_web`** | Bounded public-source research for architecture and Knowledge chat. | System Design permits **up to two searches per turn**; each Tavily request asks for **up to three results** with a **7-second timeout**. The turn retains at most **six deduplicated evidence items**. |
| **Agent and proposal safety** | Bounds model/tool cycles and validates proposed mutations. | **Four completed tool rounds maximum**; **15-second tool timeout**; **8,192 requested output tokens per System Design model round**; repeat calls rejected; **one missing-proposal retry** and **one proposal-validation repair**. |
| **Durable System Design context** | Preserves bounded conversation state for later turns. | At most **six recent turns** plus a **4,000-character summary**; pending proposals are held separately from committed canvas documents. |

The server records the **selected preference, models used, final model, and escalation flag** as execution metadata. Tool calls and canvas operations are validated in application code rather than trusted because a model emitted them.

**Token economics are architectural, not rhetorical:** local Pyodide Run uses no hosted LLM; ConTree Submit spends sandbox compute rather than asking an LLM to grade correctness; offline Knowledge enrichment avoids a new model call on each feed scroll. Model inference is concentrated where reasoning and synthesis add value.

[System Design routing implementation](web/src/lib/reasonai/server/langgraph/system-design/nodes/agent.ts) · [Model registry](web/src/features/system-design/reasonai/model-registry.ts) · [Tool limits](web/src/lib/reasonai/server/langgraph/system-design/tools.ts) · [Sponsor integration](HACKATHON_SUBMISSION.md)

---

## What doesn't work yet — engineering trade-offs

| Boundary | What remains unresolved |
| --- | --- |
| **Schema-valid AI visuals ≠ mathematical truth** | A visual walkthrough can satisfy a JSON/tool schema and still contain an incorrect algorithmic step. Structural validation protects rendering; semantic correctness needs separate deterministic checks. |
| **Generated proposal ≠ applied, durable diagram** | A valid AI proposal can be persisted as `pending` before anyone accepts it. The recorded fresh standalone-canvas run did not verify Accept → durable canvas → reload; proposal persistence and diagram persistence are distinct paths. |
| **Single-node realtime ≠ distributed rooms** | Go provides ordered operations, ACKs, bounded replay, and snapshots in process memory. A restart loses room state; multiple instances would need shared durable state and cross-instance coordination (for example, Redis or NATS plus persistence). |
| **Offline feed efficiency ≠ instant freshness** | Knowledge stories are researched and enriched ahead of user reads. They can become stale between ingestion cycles; live Tavily search is a separate on-demand path. |
| **Escalation rules ≠ an objective difficulty classifier** | The server strictly controls when Ultra is available, but **Super** decides whether to request escalation. The router does not currently use a calibrated complexity score or independently measured per-turn quality/cost optimum. |

---

## Local development: boot the real stack

**Prerequisites:** Node.js **22+**, Python **3.12**, [uv](https://docs.astral.sh/uv/), Docker, and Go **1.27+**. Use a Supabase Auth project and your own provider credentials.

**1. Clone and prepare environment files** (Bash / Git Bash):

```bash
git clone https://github.com/saksham60/recallstack.git && cd recallstack && cp backend/.env.example backend/.env && cp realtime/.env.example realtime/.env && cp web/.env.example web/.env.local
```

Before starting services, fill in the copied files:

| File | Required local configuration |
| --- | --- |
| `backend/.env` | Set `DATABASE_URL=postgresql+psycopg://recallstack:recallstack-local@localhost:5432/recallstack` for the included Docker database. Configure `SUPABASE_PROJECT_URL`, JWT issuer/audience/JWKS and `CORS_ALLOWED_ORIGINS=http://localhost:3000`. |
| `web/.env.local` | Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`, `NEXT_PUBLIC_REALTIME_BASE_URL=http://localhost:8081`, Supabase URL/anon key, and server-only `NEBIUS_API_KEY` and `TAVILY_API_KEY`. Configure `REASONAI_V2_MODE` for the desired agent surfaces. |
| `realtime/.env` | Start on port `8081` and allow `http://localhost:3000` as a WebSocket origin. |

**2–4. Start the services in three separate terminals**, each opened from the parent directory containing `recallstack`:

```bash
# Terminal 1 — FastAPI + PostgreSQL (localhost:8080)
cd recallstack/backend && docker compose up -d --wait postgres && uv sync --frozen && uv run alembic upgrade head && uv run python -m recallstack.commands.seed && uv run uvicorn recallstack.main:app --reload --port 8080
```

```bash
# Terminal 2 — Go Live Share (localhost:8081)
cd recallstack/realtime && PORT=8081 ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/server
```

```bash
# Terminal 3 — Next.js web (localhost:3000)
cd recallstack/web && npm ci && npm run dev
```

Open **http://localhost:3000**.

The web app is **Next.js**, not Vite; the Python service is **FastAPI**; the interactive **LangGraph agent runtime lives in Next.js server routes**. For Nebius ConTree Submit, configure the server-only ConTree project/image credentials and enable the execution rollout flags described by the component documentation. Flutter mobile has its own configuration and build steps.

[Complete environment and verification instructions](docs/DEVELOPMENT.md) · [Web](web/README.md) · [Backend](backend/README.md) · [Realtime](realtime/README.md) · [Mobile](mobile/README.md)

## Inspect the implementation and evidence

| Engineering claim | Where to inspect it |
| --- | --- |
| **Real 3Sum failure + saved Nemotron review** | [Submission integration record](docs/dsa-v3/integration-20261017.md) |
| **Nemotron → typed architecture proposal → pending state** | [Recorded System Design run](docs/evidence/runs/2026-10-11/SD-LIVE-01/record.md) · [Proposal contract](web/src/features/system-design/reasonai/contract.ts) |
| **Super / Ultra routing and bounded tools** | [LangGraph agent node](web/src/lib/reasonai/server/langgraph/system-design/nodes/agent.ts) · [Tool executor](web/src/lib/reasonai/server/langgraph/system-design/tools.ts) |
| **Multiplayer ordering, replay, and reconnect** | [Go service](realtime/README.md) · [Room tests](realtime/internal/room/room_test.go) |
| **Offline Nemotron/Tavily Knowledge pipeline** | [Knowledge architecture](backend/docs/knowledge-shorts.md) · [Knowledge API tests](backend/tests/knowledge/test_api.py) |
| **Deployment and trust boundaries** | [Architecture deep dive](docs/ARCHITECTURE.md) · [Web architecture](web/README.md) |

## Built during the hackathon

ReasonAI existed before the submission period. The hackathon work substantially extended it with **Nebius Token Factory + NVIDIA Nemotron agents**, **Nebius ConTree sandbox-backed DSA Submit**, bounded **LangGraph and Tavily tool workflows**, **typed System Design proposals and tier selection**, **Go realtime collaboration**, **Knowledge enrichment**, persistent learning and submission context, and **Flutter clients**.

[Hackathon technical submission](HACKATHON_SUBMISSION.md) · [Evaluation evidence](docs/evidence/INDEX.md) · [MIT license](LICENSE)

---

**ReasonAI — Build Better Engineering Judgment.** [Open the app](https://www.reasonai.tech/login) · [Watch the demo](https://www.youtube.com/watch?v=FoV2KkK72Xs) · [Explore the code](https://github.com/saksham60/recallstack)
