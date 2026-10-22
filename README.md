# ReasonAI

**Build Better Judgment.** When a developer passes the visible tests but fails a real submission—or has an architecture diagram but cannot see its failure modes—another generic AI answer is not enough. **ReasonAI connects executable evidence, editable architecture artifacts, and NVIDIA Nemotron reasoning** so engineers can investigate what failed and decide what to change.

[**Launch ReasonAI**](https://www.reasonai.tech/login) · [**Product demo**](https://www.youtube.com/watch?v=FoV2KkK72Xs) · [**Devpost**](https://devpost.com/software/reasonai) · [**Architecture details**](docs/ARCHITECTURE.md)

### Architecture first — where code ends and reasoning begins

![ReasonAI architecture showing Pyodide Run, Vercel Queue to Nebius ConTree disposable sandbox Submit, deterministic judging, Supabase verdicts, Nemotron Code Intelligence through Nebius Token Factory, LangGraph tool calls to Tavily, and offline feed discovery](docs/assets/reasonai-architecture.svg)

**Not a prompt wrapper:** Nemotron **reasons, teaches, analyzes, and proposes**. Deterministic code **runs tests, grades submissions, validates typed operations, orders real-time updates, and persists authoritative state**. The architecture explicitly separates **Nebius ConTree Sandbox** (Vercel Queue → isolated Python execution → deterministic judge → saved verdict → Nemotron Code Intelligence) from **Nebius Token Factory** (model inference), alongside the **Nemotron → validated `search_web` → Tavily → source evidence → Nemotron** loop and separate offline Tavily News discovery. AI-generated canvas changes require human approval. All Nebius credentials remain server-side. [Inspect the actual flows and trust boundaries →](docs/ARCHITECTURE.md)

## From green tests to a trusted verdict

| Local Run | Trusted Submit + Code Intelligence |
| --- | --- |
| A deliberately overfitted **3Sum** solution passed **9/9 public tests** with browser-local Pyodide. | The same solution returned **`wrong_answer`** through **Nebius ConTree Sandbox → deterministic judge → persisted submission history**. |
| Local execution gives immediate feedback while coding. | **NVIDIA Nemotron Super** uses the saved submission as context for a Code Intelligence review. |

[Inspect the execution evidence →](docs/dsa-v3/integration-20261017.md)

### System Design: model-proposed changes, human-controlled application

**Nemotron reasons over canvas nodes and edges → proposes typed operations → the server validates them → the user reviews and accepts or discards them.** The AI cannot commit a canvas edit itself; Konva applies accepted operations, while the Go service orders collaborative updates.

[**Watch the product demo ↗**](https://www.youtube.com/watch?v=FoV2KkK72Xs) · [Verified production AI proposal](docs/evidence/runs/2026-10-11/SD-LIVE-01/record.md) · [Proposal and acceptance architecture](web/docs/reasonai-proposal-recovery.md)

## Why Nebius + NVIDIA Nemotron (and where Tavily fits)

Nebius **Token Factory** is ReasonAI's server-side model inference boundary. The application uses its OpenAI-compatible interface for streamed agent turns, structured tool calls, and offline Knowledge enrichment—not for execution or trusted judging.

| Routing / component | Implemented role | Exact routing rule / enforcement |
| --- | --- | --- |
| **Nemotron Lightning** · `nvidia/Nemotron-3_5-Lightning` | Explicit lighter System Design option | Selected only when `modelPreference = "lightning"`; Auto never chooses Lightning. |
| **Nemotron Super** · `nvidia/nemotron-3-super-120b-a12b` | Default ReasonAI model; DSA tutoring, Code Intelligence, Knowledge reasoning and System Design | `modelPreference = "super"` pins Super. `modelPreference = "auto"` **starts on Super**. |
| **Nemotron Ultra** · `nvidia/Nemotron-3-Ultra-550b-a55b` | Deeper System Design option | Explicit `"ultra"`, or a **single validated Auto escalation** from Super; no implicit upgrade on timeout, request length or provider failure. |
| **Auto: Super → Ultra** | Model-initiated deeper reasoning with server-owned tier selection | Escalation is offered only if `toolRounds === 0`, the turn does **not** require a canvas proposal, preference is `"auto"`, tier is `"super"` and no prior escalation occurred. The model must make `escalate_reasoning` its **only** call with exactly one allowed `reason`: `architecture_tradeoff`, `conflicting_constraints`, `deep_reliability` or `complex_synthesis`; the server validates it and then runs Ultra. |
| **Tavily `search_web`** | Current architecture facts and source-grounded research | At most **2 searches per turn**, **3 results per search**, **6 deduplicated evidence items**, **7 s Tavily request deadline**; private canvas content is excluded from public search queries. Offline feed discovery is a separate pipeline. |
| **Bounded agent/tool loop** | Deterministic guardrails around model-generated actions | Maximum **4 tool rounds**, **15 s per tool**, **8,192 requested output tokens per model round**; at most **6 recent conversation turns** plus **4,000 summary characters**. Repeat tool calls are rejected. An explicitly required canvas proposal gets **one missing-proposal retry**; invalid proposals get **one validation repair**. |

**Why this architecture matters:** The Knowledge Feed performs discovery, deduplication, image validation, Nemotron enrichment and persistence **offline**. Its normal online read/ranking path stays deterministic instead of paying for live model generation on every scroll. DSA Run uses **Pyodide in the browser**; trusted Submit uses the sandbox-based judge, not an LLM verdict. [Model IDs, sponsor integration, and hackathon-period changes →](HACKATHON_SUBMISSION.md) · [Technical evaluation protocol →](docs/evidence/EVALUATION_PROTOCOL.md)

## Judge quickstart — try it in five minutes

**No install or personal signup required.** Open **[ReasonAI](https://www.reasonai.tech/login)** and choose **Continue as Hackathon Judge**.

1. **First insight:** Open **System Design**, ask for a bottleneck or failure review of the current architecture, and inspect the analysis against actual canvas nodes and edges.
2. **See the safety boundary:** Request canvas changes. Review any proposed operations and choose whether to **accept or discard** them. The model cannot silently edit a shared document.
3. **Test the learning loop:** Open **DSA → 3Sum**, request a progressive hint, then use local **Run** and authenticated **Submit**. Review the returned verdict, history and Code Intelligence report.
4. **Explore collaboration and freshness:** Use **Live Share** with a second browser to test synchronized canvas edits, or open a Knowledge story and ask for recent related developments using Tavily-backed research.

**Try this prompt in System Design:** `Review this architecture for a single point of failure. Identify affected nodes and propose reviewable changes.`

## What doesn't work yet — and what we learned

| Deep systems trade-off | Where the architecture stops today |
| --- | --- |
| **Valid schema ≠ true reasoning.** | Zod/typed canvas tools can ensure nodes, IDs, edges and operations are structurally valid; they cannot prove an LLM's capacity estimates, failure analysis or mathematical explanations. A proposal still needs human architectural judgment. |
| **Single-instance collaboration ≠ distributed durability.** | Go rooms keep ordered operations, snapshots, presence and replay in process memory. Reconnect works within the retained history of a running instance; process restarts and multiple independent instances do not provide a durable, shared room state. |
| **Offline efficiency ≠ real-time freshness.** | Tavily discovery and Nemotron enrichment happen before Knowledge stories are stored, so infinite-scroll feed reads stay cheap and deterministic. Stories can age between refreshes; on-demand `search_web` improves recency only when the user asks a current-facts question. |
| **Auto escalation ≠ objective difficulty detection.** | The server gates when Ultra can be requested, but the initial judgment to call `escalate_reasoning` still comes from Super. It is not a calibrated correctness-or-cost optimizer, and deeper model inference does not guarantee a better architecture. |

## Run the stack locally

**Prerequisites:** Node.js 22+, Python 3.12, [uv](https://docs.astral.sh/uv/), Docker, Go 1.27+, and your own Supabase project (Auth). After **command 1**, populate the copied environment files: `backend/.env` (set `DATABASE_URL=postgresql+psycopg://recallstack:recallstack-local@localhost:5432/recallstack` for the bundled Docker database, plus your Supabase Auth configuration), `web/.env.local` (Supabase URL/anon key, `NEXT_PUBLIC_REALTIME_BASE_URL=http://localhost:8081`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`, and server-side `NEBIUS_API_KEY`/`TAVILY_API_KEY`), and `realtime/.env`. Add ConTree credentials and enable execution flags if you are testing sandbox Submit.

Run **these four actual terminal commands** in Bash/Git Bash. Commands **2–4** run in separate terminals opened from the directory containing `recallstack`:

```bash
git clone https://github.com/saksham60/recallstack.git && cd recallstack && cp backend/.env.example backend/.env && cp realtime/.env.example realtime/.env && cp web/.env.example web/.env.local
cd recallstack/backend && docker compose up -d --wait postgres && uv sync --frozen && uv run alembic upgrade head && uv run python -m recallstack.commands.seed && uv run uvicorn recallstack.main:app --reload --port 8080
cd recallstack/realtime && PORT=8081 ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/server
cd recallstack/web && npm ci && npm run dev
```

Open **http://localhost:3000**. Browser sessions use the configured Supabase Auth project; Nebius and Tavily calls run server-side. [Full environment and verification reference →](docs/DEVELOPMENT.md)

### Inspectable engineering evidence

| Claim | Source of evidence |
| --- | --- |
| Nemotron agent orchestration and tier routing | [Hackathon technical submission](HACKATHON_SUBMISSION.md) · [System Design agent](web/docs/system-design-reasonai.md) |
| Deterministic judging and saved code reviews | [DSA integration run](docs/dsa-v3/integration-20261017.md) |
| Typed AI canvas proposals and safety checks | [Proposal lifecycle](web/docs/reasonai-proposal-recovery.md) · [browser tests](web/e2e/reasonai.spec.ts) |
| Ordered collaboration and replay | [Realtime service](realtime/README.md) · [room tests](realtime/internal/room/room_test.go) |
| Tavily ingestion and deterministic feed ranking | [Knowledge pipeline](backend/docs/knowledge-shorts.md) · [Knowledge API tests](backend/tests/knowledge/test_api.py) |

## Built during the hackathon

ReasonAI began before the hackathon. The submission-period work includes **Nebius/Nemotron-based LangGraph agents, bounded Tavily tools, reviewable architecture proposals, tiered System Design models, a Go collaboration service, Knowledge enrichment, contextual DSA feedback, persistent learning state and Flutter clients**. The [hackathon submission record](HACKATHON_SUBMISSION.md) and Git history distinguish these contributions from the pre-existing product.

**ReasonAI — Build Better Judgment.** [Live app](https://www.reasonai.tech/login) · [Devpost](https://devpost.com/software/reasonai) · [Full architecture](docs/ARCHITECTURE.md) · [MIT license](LICENSE)
