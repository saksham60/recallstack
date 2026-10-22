# ReasonAI

<p align="center">
  <strong>Build Better Engineering Judgment.</strong>
</p>

<p align="center">
  <strong>Run the code. Challenge the architecture. Review the evidence.</strong><br/>
  One engineering workbench combining deterministic DSA execution, multiplayer System Design, and NVIDIA Nemotron reasoning on Nebius.
</p>

<p align="center">
  <a href="https://www.reasonai.tech/login"><strong>Launch ReasonAI · Judge Access</strong></a> &nbsp;·&nbsp;
  <a href="https://www.youtube.com/watch?v=FoV2KkK72Xs"><strong>Watch the Demo</strong></a> &nbsp;·&nbsp;
  <a href="https://devpost.com/software/reasonai">Devpost</a> &nbsp;·&nbsp;
  <a href="docs/ARCHITECTURE.md">Architecture Deep Dive</a>
</p>

---

### One workbench. Three evidence-backed workflows.

![Wide architecture overview of ReasonAI: Pyodide and Nebius ConTree deterministic judging, LangGraph/NVIDIA Nemotron via Nebius Token Factory, reviewable Konva canvas changes, Go realtime collaboration, and Tavily-enriched Knowledge Feed](docs/assets/reasonai-overview.svg)

**Deterministic systems decide what happened.** Pyodide runs public tests; ConTree isolates private-case Submit; trusted code grades and persists verdicts; Go sequences shared canvas operations. **Nemotron reasons over that evidence**, invokes bounded Tavily search, and proposes validated changes. **Engineers decide what to accept.**

<details>
<summary><strong>Explore the full architecture, service boundaries, and detailed data flows</strong></summary>

![Detailed ReasonAI technical architecture](docs/assets/reasonai-architecture.svg)

[Read the technical architecture →](docs/ARCHITECTURE.md)
</details>

## The core loops: from plausible answers to inspectable evidence

![Two ReasonAI engineering workflows: recorded 3Sum Pyodide 9/9 to Nebius ConTree wrong_answer and saved Nemotron review; System Design typed Nemotron proposal and human approval architecture](docs/assets/reasonai-workflows.svg)

### DSA · A green Run is not a trusted Submit

In a recorded **3Sum** example, a deliberately overfitted solution passed **9/9 public tests** in browser-local Pyodide but returned **`wrong_answer`** on real **Nebius ConTree Sandbox** Submit. The deterministic verdict was persisted, and **Nemotron Super** generated a saved Code Intelligence review associated with that submission.

[See the real Run → Submit → Code Intelligence evidence →](docs/dsa-v3/integration-20261017.md)

### System Design · From reasoning to a reviewable canvas diff

**Konva canvas context → Nemotron/LangGraph reasoning → typed node and edge operations → validation → user Accept or Discard.** A recorded production run generated **five nodes and four edges**, storing the nine validated proposed changes as `pending` for review. Live Share uses **Go WebSockets** to order committed collaboration operations.

[Inspect the recorded AI proposal →](docs/evidence/runs/2026-10-11/SD-LIVE-01/record.md) · [Inspect proposal handling →](web/docs/reasonai-proposal-recovery.md)

### Knowledge · Research once, read efficiently

**Tavily discovery → deduplication → offline Nemotron enrichment → PostgreSQL/R2 → prepared feed.** The feed read path does not call an LLM per scroll. Ask ReasonAI can separately invoke a bounded live `search_web` tool for current public technical information.

[Knowledge ingestion and ranking →](backend/docs/knowledge-shorts.md)

---

## Judge quickstart: try the engineering loop

**No local installation or personal account setup.** Open [ReasonAI](https://www.reasonai.tech/login) and select **Continue as Hackathon Judge**.

1. **System Design — question the diagram.** Open **System Design** and ask: `Review this architecture for a single point of failure. Identify the affected nodes and propose reviewable changes.`
2. **Human approval — inspect the diff.** Review Nemotron's proposed node/edge operations. Use **Accept** or **Discard** rather than treating AI output as an automatic diagram mutation.
3. **DSA — test beyond green local results.** Open **DSA → 3Sum**. Request a progressive hint, run public tests locally, then use **Submit** to inspect the judged result, submission history, and Code Intelligence.
4. **Collaboration and current facts.** Open a **Live Share** room in a second browser session to inspect synchronized canvas edits. Then visit a **Knowledge** story and ask about recent related technical developments to exercise Tavily-backed research.

[Watch the end-to-end product demo →](https://www.youtube.com/watch?v=FoV2KkK72Xs)

## Multi-model orchestration: Nebius Token Factory + Nemotron + Tavily

**Nebius Token Factory** is the server-side NVIDIA Nemotron inference boundary. **Nebius ConTree** is a separate sandbox execution boundary: it runs submitted code, not model-generated verdicts.

| Nemotron tier | Role | Exact selection rule |
| --- | --- | --- |
| **Lightning** · `nvidia/Nemotron-3_5-Lightning` | Explicit lightweight System Design model option | `modelPreference = "lightning"`; **Auto never selects Lightning**. |
| **Super** · `nvidia/nemotron-3-super-120b-a12b` | Default ReasonAI tier for DSA tutoring, Code Intelligence, System Design and Knowledge enrichment | `"super"` pins this tier. **Auto starts on Super**. |
| **Ultra** · `nvidia/Nemotron-3-Ultra-550b-a55b` | Explicit deeper-reasoning option in System Design | `"ultra"`, or exactly one permitted escalation from Super. |
| **Auto: Super → Ultra** | Model-requested escalation, validated by application code | Allowed only if **`toolRounds === 0`**, `modelPreference === "auto"`, current tier is `super`, no canvas proposal is required, and no earlier escalation occurred. The model must call **`escalate_reasoning` alone** with exactly one permitted `reason`: `architecture_tradeoff`, `conflicting_constraints`, `deep_reliability`, or `complex_synthesis`. |

The runtime tracks **selected preference, models used, final tier, and escalation**, instead of trusting the generated answer to report its own execution path.

<details>
<summary><strong>Inspect exact Tavily, tool-loop, retry, and state limits</strong></summary>

| Boundary | Implemented guardrail |
| --- | --- |
| **Tavily research** | Up to **2 searches** in a System Design turn, **3 requested results** per search, up to **6 deduplicated evidence items**, **7 s** timeout per Tavily request. |
| **Model rounds** | **8,192 requested output tokens** per System Design model call; maximum **4 completed tool rounds**. |
| **Tool calls** | **15 s** tool execution timeout; repeated equivalent calls rejected. |
| **Canvas operations** | Typed validation and authorization; **one missing-proposal retry** and **one proposal-validation repair**. |
| **Durable conversation** | At most **6 recent turns** and a **4,000-character summary**; proposal state is separate from committed diagram state. |

[Agent routing](web/src/lib/reasonai/server/langgraph/system-design/nodes/agent.ts) · [Model registry](web/src/features/system-design/reasonai/model-registry.ts) · [Tool executor](web/src/lib/reasonai/server/langgraph/system-design/tools.ts) · [Tavily implementation](web/src/lib/tavily/search.ts)
</details>

**Efficiency by design:** Pyodide's public Run does not require hosted inference; the judge—not an LLM—grades sandbox execution; prepared Knowledge stories avoid per-scroll model calls. Nemotron is reserved for tasks that require explanation, synthesis, and proposals.

[Detailed Nebius + NVIDIA integration →](HACKATHON_SUBMISSION.md)

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
