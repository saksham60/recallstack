# ReasonAI

ReasonAI is an **AI-native technical reasoning workspace** for developers, engineering students, and architects. It combines guided DSA learning, AI-assisted system design, a continuously refreshed engineering Knowledge Feed, persistent learning memory, grounded web research, visual reasoning, and live multi-user architecture collaboration across Web and Mobile.

**Live demo:** [https://www.reasonai.tech](https://www.reasonai.tech)

> ReasonAI is not just a chat interface around an LLM. The product separates model reasoning, durable learning state, tools, deterministic application services, realtime collaboration, user-controlled mutations, and offline/client state into explicit architectural boundaries.

---

## Judge access

1. Open the live demo.
2. Click **Continue as Hackathon Judge**.
3. Start exploring immediately; no account setup is required.

## What you can try

- **AI-guided DSA learning** — hints, explanations, review, complexity analysis, trace walkthroughs, research and progressive help tied to the active problem.
- **Validated visual DSA explanations** — array/pointer, graph/tree, matrix and dynamic-programming walkthroughs rendered from a strict visual contract rather than arbitrary model HTML/SVG.
- **AI-assisted System Design** — Chat, Review, Fix and Eagle View reasoning over the active architecture.
- **Architecture analysis overlays** — bottleneck, failure, capacity, reliability, traffic and cost analysis grounded in actual canvas node/edge IDs.
- **Reviewable AI canvas changes** — ReasonAI can propose components and connections, but the user remains the mutation boundary: suggestions are inspected and individually accepted/dropped before touching the document.
- **Live collaborative architecture canvas** — capability-link/QR sharing, ordered operations, presence, cursors, movement previews, replay and reconnect support.
- **Tavily-grounded research** — current or source-specific evidence is retrieved only when needed and surfaced as citations.
- **Knowledge Feed** — AI-enriched engineering stories discovered from live sources, ranked per user, delivered on Web and Mobile, and connected to Ask ReasonAI.
- **Persistent ReasonAI learning state** — bounded conversation memory plus optional cross-conversation DSA learner memory.
- **Mobile ReasonAI** — Flutter experience for Knowledge Feed, Ask ReasonAI, DSA, profile/settings and device-local saved/draft state.

---

# Architecture

## End-to-end high-level architecture

This README follows the current ReasonAI Miro HLD and then drills into the implementation boundaries that are easy to lose in a single diagram.

```mermaid
flowchart TB
    USER[Users\nDevelopers • Learners • Architects]

    subgraph CLIENTS[Client Experience]
      WEB[Web\nNext.js • React • TypeScript • Konva\nKnowledge • DSA • System Design]
      MOB[Mobile\nFlutter • Riverpod • Dio • Drift\nKnowledge • DSA • Ask ReasonAI]
    end

    subgraph ENTRY[Edge, Identity and API]
      VERCEL[Vercel\nNext.js hosting + server routes / BFF]
      AUTH[Supabase Auth\nOAuth • JWT • session identity]
      API[FastAPI on GCP Cloud Run\nlearning • knowledge • profile • sync]
      RT[Go Realtime on Render\nWebSocket collaboration]
    end

    subgraph PRODUCT[Product Services]
      KNOW[Knowledge Service\nfeed • stories • events • ranking • preferences]
      DSA[DSA + Learning\nproblem context • progress • visual reasoning]
      PROFILE[User + Preference\nprofile • settings • personalization]
      SD[System Design\ncanvas context • proposals • analysis]
    end

    subgraph AI[Reasoning and Agent Layer]
      ORCH[ReasonAI Orchestrator\ncontext • streaming • tool loop]
      LG[LangGraph\nstate • bounded memory • graph lifecycle]
      NEB[Nebius Token Factory]
      NEM[NVIDIA Nemotron]
      TAV[Tavily\nsearch • extract • grounding]
      TOOLS[Tools\nsearch • visual • canvas actions]
    end

    subgraph DATA[Data and State]
      PG[(Supabase PostgreSQL\nusers • learning • knowledge • events\nReasonAI conversations • learner memory)]
      R2[Cloudflare R2 / CDN\nKnowledge media]
      LOCAL[(Mobile Drift / SQLite\nsaved stories • DSA drafts)]
    end

    subgraph JOBS[Background Processing]
      KJOB[Knowledge Refresh Job\ndiscovery • dedupe • enrichment\nimage processing • retention]
    end

    USER --> WEB
    USER --> MOB

    WEB --> VERCEL
    WEB --> AUTH
    MOB --> AUTH
    VERCEL --> API
    WEB --> API
    MOB --> API

    API --> KNOW
    API --> DSA
    API --> PROFILE
    WEB --> SD

    WEB --> ORCH
    MOB --> ORCH
    ORCH --> LG
    LG --> NEB --> NEM
    ORCH --> TAV
    ORCH --> TOOLS

    WEB <-->|WSS| RT
    SD --> RT

    KNOW --> PG
    DSA --> PG
    PROFILE --> PG
    LG --> PG
    API --> PG

    KNOW --> R2
    MOB --> LOCAL

    KJOB --> TAV
    KJOB --> NEB
    KJOB --> R2
    KJOB --> PG
```

## Architectural responsibilities

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web client | Next.js, React, TypeScript, Konva | Product UI, DSA workspace, Knowledge Feed, System Design canvas, local interaction state and authenticated server entrypoints |
| Mobile client | Flutter, Riverpod, Dio, Drift | Feed, Ask ReasonAI, DSA, profile/settings and per-user device-local state |
| Identity | Supabase Auth | OAuth/session lifecycle and JWT identity |
| Application API | FastAPI, SQLAlchemy 2, psycopg 3 | Deterministic domain APIs, Knowledge, learning/progress, profile, device/sync and persistence |
| AI/BFF runtime | Next.js server routes | Authenticated ReasonAI orchestration, streaming, model calls, Tavily tools and structured AI artifacts |
| Agent runtime | LangGraph | Request-scoped agent graphs with bounded durable conversation state and explicit tool loops |
| Model serving | Nebius Token Factory | OpenAI-compatible server-side inference endpoint |
| Reasoning model | NVIDIA Nemotron | Tutoring, architecture reasoning, synthesis, classification and Knowledge enrichment |
| Research | Tavily | Bounded public search/extract and grounding evidence |
| Realtime | Go + WebSockets | System Design rooms, ordered operations, ACKs, replay, presence, ephemeral previews and reconnect |
| Primary data | PostgreSQL / Supabase | Product data, Knowledge data, learning state, ReasonAI state and learner memory |
| Media | Cloudflare R2/CDN | Processed Knowledge Feed images and public media delivery |
| Mobile local state | Drift / SQLite | Per-user saved-story cache and DSA approach/code drafts |
| Deployment | Vercel, GCP Cloud Run, Render | Web/AI edge, backend/jobs and realtime service respectively |

### An important database boundary

Supabase is used for **Auth and PostgreSQL**, but not every service talks to it the same way:

- The FastAPI backend uses standard PostgreSQL through SQLAlchemy/psycopg. It does **not** use the Supabase SDK/PostgREST for normal runtime persistence.
- FastAPI verifies the Supabase JWT and derives the current user from the verified token subject.
- ReasonAI's web-side conversation/learner-memory implementation uses its authenticated Supabase HTTPS path for the ReasonAI product tables.
- The browser/mobile client never decides its own authoritative `user_id` for protected writes.

---

# End-to-end runtime flows

## 1. Authentication and identity

```mermaid
sequenceDiagram
    participant U as User
    participant C as Web / Mobile
    participant A as Supabase Auth
    participant S as Server
    participant DB as PostgreSQL

    U->>C: Sign in / judge access
    C->>A: OAuth/session request
    A-->>C: Access token / session
    C->>S: Request + Bearer token
    S->>A: Verify token / subject
    A-->>S: Verified identity
    S->>DB: Execute owner-scoped operation
    DB-->>S: Result
    S-->>C: User-scoped response
```

The security rule is simple: **identity comes from the verified authentication context, not request JSON**. The FastAPI backend and ReasonAI routes enforce their own authorization boundaries even when the page itself is already authenticated.

A stale browser session gets a bounded refresh/retry path rather than an unbounded retry loop. Temporary auth/provider failures are separated from a genuine sign-out where possible.

---

## 2. DSA ReasonAI request

The DSA tutor is a stateful learning runtime, not a stateless completion endpoint.

```mermaid
sequenceDiagram
    participant L as Learner
    participant W as DSA Workspace
    participant R as ReasonAI Route
    participant M as Durable Memory
    participant G as LangGraph DSA Graph
    participant T as Tools
    participant N as Nemotron / Nebius
    participant V as Tavily

    L->>W: Ask / Hint / Review / Trace / Visualize
    W->>R: Authenticated request + bounded problem/workspace context
    R->>M: Acquire conversation run + load durable state
    M-->>R: Recent turns + summary + hint progress
    R->>G: Start request-scoped graph
    G->>N: Stream model round

    alt model requests search_web
      N-->>G: Tool call
      G->>T: Validate + execute search_web
      T->>V: Bounded public search
      V-->>T: Untrusted evidence
      T-->>G: Normalized evidence
      G->>N: Continue with tool result
    else model requests create_visual
      N-->>G: Tool call
      G->>T: Validate strict visual contract
      T-->>G: Safe visual artifact or validation error
      G->>N: Continue / repair if allowed
    end

    N-->>G: Final streamed answer
    G->>M: Candidate bounded conversation state
    R->>M: Atomic terminal persistence
    R-->>W: NDJSON/SSE-style runtime events + final answer
```

### DSA graph state

The DSA LangGraph graph has three nodes:

```text
START -> agent -> [tools -> agent]* -> finalize -> END
```

The graph is request-scoped. Durable state is deliberately small and server-owned:

- maximum **6 recent turns**;
- a **4,000-character compact summary** of overflow turns;
- per-turn bounded user/assistant text;
- `hintProgress` so progressive hints survive turns;
- active problem identity;
- last tutor action/mode;
- total durable state bounded to **64 KiB**.

Request payloads, raw tool output, model working messages and transient visual/search state are not treated as permanent memory.

### DSA tool loop

The V2 DSA agent exposes two bounded tools:

- `search_web` — public/current/exact-problem evidence through Tavily;
- `create_visual` — a strict structured visual lesson contract.

The runtime allows at most **4 tool rounds** and at most **2 visual attempts**. A normal conceptual answer does not need a tool. Tool output is explicitly treated as untrusted data, and search results are not written into durable conversation memory.

### DSA streaming and run lifecycle

The runtime persists a run lifecycle instead of assuming the HTTP connection itself is the transaction boundary:

- a running row acts as a **120-second lease**;
- an active generation refreshes that lease at most every **12 seconds**;
- an expired run is atomically transitioned to `interrupted` before another run can take over;
- idempotency keys prevent replay from executing the model/tools twice;
- terminal states are immutable;
- provider first-event and idle timeouts are bounded;
- the provider has a 60-second deadline and tools have bounded execution deadlines;
- cancellation/interruption never writes learner-memory facts as though a successful teaching turn occurred.

This prevents a dropped browser connection, serverless retry or late invocation from silently corrupting conversation state.

---

## 3. System Design ReasonAI request

System Design uses the same graph idea but different state and tools.

```text
START -> agent -> [tools -> agent]* -> finalize -> END
```

Durable architecture-conversation state is bounded to:

- **6 recent turns**;
- **4,000-character summary**;
- last mode (`chat`, `review`, `fix`, `eagle`);
- active `diagramId`;
- **64 KiB** total durable state.

The graph can emit streaming text plus typed artifacts such as sources, architecture analysis and canvas proposals.

### System Design tools

The current V2 tool surface is:

| Tool | Purpose | Safety boundary |
| --- | --- | --- |
| `search_web` | Current provider capabilities, documentation, quotas, pricing and other external facts | Max two searches; bounded evidence; public facts only |
| `show_architecture_analysis` | Semantic bottleneck/failure/capacity/reliability/traffic/cost overlay | Strict existing node/edge IDs; passive overlay; no document mutation |
| `propose_canvas_changes` | Structured node/edge change suggestions | Only available when the turn authorizes edits; user acceptance remains the final mutation boundary |

The graph allows at most **4 tool rounds**. Research is bounded to at most two Tavily searches, three results per search and six unique sources for one request.

### Analysis is not mutation

ReasonAI architecture analysis is rendered as a passive Konva overlay over the current canvas. It does not enter:

- document persistence;
- undo history;
- exports;
- the realtime operation stream.

Topology/text changes invalidate stale analysis. Geometry-only movement can preserve it. A response derived from an older diagram is discarded rather than applied to a newer architecture.

### AI canvas changes are reviewable

A proposal is validated server-side and revalidated against the latest browser document before application. The model cannot directly mutate the canvas. Accepted changes flow through the same deterministic canvas operations and realtime transport as human edits, which means AI edits receive the same validation, undo and collaboration semantics as normal edits.

---

# Memory and self-learning architecture

ReasonAI intentionally has **several different memory layers**. Calling all of them simply "memory" hides important safety and product behavior.

## Layer 1 — request-scoped working context

This is the context needed to answer the current request:

- active DSA problem metadata;
- bounded user approach/code/notes;
- active System Design architecture JSON;
- current selection/mode;
- current Knowledge story context;
- transient tool messages and retrieved evidence.

This layer is ephemeral and aggressively bounded. External content and user-controlled architecture text are marked as untrusted data.

## Layer 2 — durable conversation memory

DSA and System Design maintain server-owned compact conversation state rather than blindly resending unlimited browser chat history.

For DSA, durable state tracks recent validated turns, compact overflow summary, hint progression, active problem and tutor mode. For System Design it tracks recent turns, compact summary, mode and active diagram identity.

Only a successfully finalized graph candidate becomes authoritative durable state. Tool scratchpads, hidden model reasoning and raw Tavily payloads are not durable conversation memory.

## Layer 3 — cross-conversation DSA learner memory

ReasonAI also has an optional **learner profile** that can survive beyond a single conversation.

Enable it with:

```text
REASONAI_MEMORY_MODE=dsa
```

When enabled:

- at most **8 user-owned learner facts** are read into a DSA turn;
- at most **3 bounded facts** are extracted after a successful authoritative answer;
- supported memory is pedagogical: preferences, strengths, misconceptions, goals, strategies and progress;
- cancelled, failed or interrupted runs never write learner memory;
- transcripts, provider reasoning and raw web evidence are not stored as learner facts;
- memory rows are protected by user ownership/RLS;
- semantic upsert keys prevent uncontrolled duplicate memory accumulation.

This is the current "self-learning" behavior in DSA: **ReasonAI learns a bounded pedagogical profile about how to teach the user; it does not retrain Nemotron or modify model weights.**

## Layer 4 — Knowledge interaction memory and personalization

The Knowledge system stores explicit preferences plus user/story interaction history.

Supported events are:

```text
VIEW
OPEN
SAVE
UNSAVE
HIDE
UNHIDE
SHARE
ASK_REASONAI
```

Events are accepted in idempotent batches of 1–100. `eventId` prevents duplicate retries, and `(occurred_at, event_id)` ordering prevents an old offline event from undoing a newer SAVE/HIDE state.

Current feed personalization uses deterministic signals:

- explicit topic preferences;
- source preferences;
- blocked topics / disabled sources;
- minimum importance;
- current viewer state such as hidden/saved/seen;
- an optional free-text interest prompt whose bounded terms participate in PostgreSQL full-text matching;
- story quality, importance and freshness.

### Current ranking policy

The deterministic ranking policy currently weights:

```text
importance             0.40
story quality          0.20
source quality         0.10
matching topic weight  0.15
source preference      0.05
7-day freshness        0.10
```

No LLM call is made on the hot feed path, and the current feed ranker does **not** silently infer a behavioral profile from raw events.

### Self-learning loop — next stage

The Miro architecture explicitly separates the next learned-affinity loop from the current ranker:

```mermaid
flowchart LR
    FEED[Web + Mobile Feed] --> EVENTS[VIEW • OPEN • SAVE • SHARE • ASK • HIDE]
    EVENTS --> RAW[(Raw interaction history)]
    RAW -. next .-> LEARNER[Interaction Learner]
    LEARNER -.-> PROFILE[Learned topic/source affinity]
    EXPLICIT[Explicit preferences] --> RANKER[Feed Ranker]
    PROFILE -. next .-> RANKER
    RANKER --> FEED
```

The intended evolution is to derive bounded topic/source affinity from behavior and merge it with explicit preferences. The README marks that path as **next**, not as a production feature, so the architecture does not overclaim autonomous learning.

---

# Knowledge Feed architecture

## Offline enrichment pipeline

Knowledge ingestion is intentionally moved out of the online feed request.

```mermaid
flowchart LR
    TRIGGER[Scheduled / user-triggered refresh]
    TAV[Tavily News Search]
    HN[Hacker News API]
    DEDUPE[Canonicalize URLs\n+ conservative dedupe]
    FETCH[Fetch metadata/content\n+ recency/technical gates]
    IMG[Validate image\n+ WebP processing]
    NEM[Nemotron enrichment\ntitle • summary • why it matters\ncategory • topics • scores]
    R2[Cloudflare R2/CDN]
    DB[(PostgreSQL)]
    API[FastAPI Knowledge API]
    WEB[Web Feed]
    MOB[Mobile Feed]

    TRIGGER --> TAV
    TRIGGER --> HN
    TAV --> DEDUPE
    HN --> DEDUPE
    DEDUPE --> FETCH
    FETCH --> IMG
    FETCH --> NEM
    IMG --> R2
    NEM --> DB
    R2 --> DB
    DB --> API
    API --> WEB
    API --> MOB
```

### Why the pipeline is designed this way

1. Discovery happens through adapters, currently Tavily and the official Hacker News API.
2. URLs/titles are canonicalized and deduplicated before paid processing.
3. Article recency and technical-content gates reject unsuitable candidates early.
4. **Image validation happens before paid model inference** so tokens are not spent on stories that cannot be displayed.
5. Nemotron produces strict structured enrichment: title, brief, why-it-matters, broad category, open-vocabulary topics and quality/importance signals.
6. The image is transformed and uploaded to R2/CDN.
7. Story metadata/topics are committed to PostgreSQL in a short transaction.
8. The online API simply ranks/reads existing data; it does not call Tavily, Nemotron or R2 write APIs on every feed request.

The job uses bounded concurrency, provider-specific timeouts/retries and a PostgreSQL advisory lock so overlapping refreshes do not create duplicate paid work.

### Story/media lifecycle

- active Knowledge stories have a **7-day** freshness/retention window;
- read queries enforce freshness even if cleanup is delayed;
- deterministic canonical-URL IDs/keys make retries safer;
- R2 objects are deleted in bounded cleanup batches;
- feed images are served directly from the CDN rather than proxied through FastAPI;
- processed images retain their source aspect ratio within a 1080×1350 bound and are converted to WebP.

## Feed delivery and cursor stability

The feed uses signed cursor pagination rather than OFFSET pagination.

A cursor is:

- HMAC-signed;
- user/profile scoped;
- topic/source scoped;
- preference-version aware;
- bounded in size;
- time-limited;
- anchored so new stories do not reorder the queue underneath someone who is reading.

Changing preferences or filters invalidates an incompatible cursor instead of pretending the old ranking session is still valid.

## Ask ReasonAI on a story

The story chat route re-fetches canonical story context server-side using the authenticated user before it invokes the model. Client-supplied story text cannot replace authoritative context.

Knowledge chat uses the shared streaming/ReasonAI presentation primitives. Its dialog conversation is currently ephemeral: it stays in memory while the story dialog is open and is cleared/aborted when the dialog closes. This is intentionally different from the durable DSA conversation surface.

---

# Realtime System Design collaboration

The realtime service is a separate Go WebSocket service because canvas collaboration has different latency, ordering and lifecycle requirements from normal REST APIs.

## Current topology

```text
Browser clients
      |
      | HTTP + WebSocket protocol v1
      v
Go HTTP server on Render
      |
Room manager
      |
One serialized event loop per active room
      |
In-memory snapshot + ordered operation window + dedupe + presence
```

The Go service treats canvas payloads as **opaque JSON**. It owns transport semantics; React/Konva owns document semantics.

## Room creation and capability security

`POST /v1/rooms` creates a bounded room and returns a **256-bit URL-safe capability token**. The token is the guest credential for that collaboration room and is never logged in full.

Current default limits include:

| Limit | Default |
| --- | ---: |
| Participants per room | 10 |
| Active rooms per process | 1000 |
| Idle room TTL | 30 minutes |
| Maximum room lifetime | 4 hours |
| Retained operations after checkpoint | 2000 |
| Recent operation IDs for dedupe | 4000 |
| Per-client outbound queue | 128 messages |
| Client inbound rate | 120 messages/second |
| WebSocket inbound message | 256 KiB |
| Ping interval | 20 seconds |
| Pong timeout | 10 seconds |

## Three classes of collaborative state

### 1. Committed shared state

Committed operations include structural node/edge/module changes. The server assigns a monotonically increasing room sequence and broadcasts operations in that serialized order.

The sender receives an ACK. Reusing the same `opId` returns the original sequence with `duplicate: true` instead of applying the mutation again.

### 2. Ephemeral shared state

High-frequency interaction previews do not belong in durable document history:

- drag previews;
- resize previews;
- batched freehand deltas;
- cursor movement.

These use ephemeral/presence messages. They are not sequenced into the document, are not added to undo history and are not replayed as committed operations.

### 3. Local-only UI state

Selection, active tool, viewport, inspector tab, modal state and animation playback remain local to each participant.

## Replay and reconnect

A reconnecting client can provide `lastSequence`.

The server returns either:

- `replay` — only operations after the client's known sequence; or
- `full` — latest snapshot checkpoint plus operations after it.

If the requested sequence is older than the retained checkpoint window, the server falls back to `full`.

Clients can include a full opaque document snapshot with a committed operation. That operation becomes the new checkpoint and compacts older replay history. Once the retained operation limit is reached, the service can require a checkpoint before accepting further committed operations.

## Presence and liveness

Presence contains a bounded display name, viewed diagram and optional world-space cursor. Cursor updates are latest-only/throttled. Transport WebSocket ping/pong is independent from protocol-level ping/pong.

Slow clients are disconnected instead of blocking a room because every connection has a bounded outbound queue and a dedicated writer.

## Current realtime boundary vs future persistence

The current Go realtime service is intentionally **single-process and in-memory**:

- no Redis;
- no message broker;
- no cross-instance synchronization;
- no CRDT/Yjs layer;
- no durable room database recovery.

A process restart/redeploy loses active rooms. Render should therefore run this implementation as one instance.

The broader HLD has a natural future path to persist collaboration checkpoints/snapshots and add a distributed coordination layer, but the current README keeps that as an evolution path rather than claiming it already exists.

---

# Mobile architecture

The mobile client is a native Flutter application rather than a WebView wrapper.

```mermaid
flowchart TB
    APP[Flutter App]
    UI[Feature UI\nFeed • DSA • Ask ReasonAI • Profile]
    STATE[Riverpod state]
    HTTP[Dio HTTP]
    AUTH[Supabase Flutter Auth]
    LOCAL[(Drift / SQLite)]
    API[FastAPI]
    AI[ReasonAI Next.js routes]

    APP --> UI
    UI --> STATE
    STATE --> HTTP
    STATE --> LOCAL
    HTTP --> AUTH
    HTTP --> API
    HTTP --> AI
```

The current Drift database is partitioned by signed-in user and contains:

- `SavedStories` — device-local saved story metadata;
- `DsaDrafts` — local approach and code drafts keyed by content ID.

This makes useful work survive navigation/app restarts without pretending every mobile state is globally synchronized.

The backend separately provides a more general device/offline synchronization substrate for progress, bookmarks, notes, practice attempts, reviews and catalog/user snapshots. It supports:

- registered devices;
- idempotent mutation IDs;
- ordered per-user cursors;
- incremental sync;
- explicit `full_resync_required` recovery;
- immutable full-resync snapshots;
- ACK before a device is considered caught up;
- bounded retention and conflict projections.

System Design multiplayer/canvas remains **Web-only in the current product scope**. Mobile focuses on Knowledge, DSA and ReasonAI consumption rather than trying to reproduce the full collaborative canvas interaction model on a phone.

---

# Persistence and state ownership

ReasonAI deliberately avoids putting every type of state into one store.

| State | Owner | Persistence |
| --- | --- | --- |
| Auth session | Supabase Auth + clients | Auth/session lifecycle |
| Learning catalog/progress/notes/reviews | FastAPI + PostgreSQL | Durable |
| Knowledge stories/topics/preferences/events | FastAPI + PostgreSQL | Durable |
| DSA conversation state | ReasonAI conversation tables | Durable and bounded |
| DSA cross-conversation learner profile | ReasonAI learner-memory table | Durable, optional and bounded |
| System Design conversation state | ReasonAI conversation state | Durable and bounded when V2 persistence is enabled |
| System Design document | Web application/domain persistence | Durable according to existing document flow |
| Architecture analysis overlay | Browser React state | Ephemeral |
| AI proposal before acceptance | Browser/ReasonAI response state | Ephemeral until user applies |
| Realtime room operation window | Go process | Ephemeral/in-memory |
| Realtime cursors/drag previews | Go process + clients | Ephemeral |
| Knowledge images | Cloudflare R2/CDN | Durable for story lifetime |
| Mobile saved stories / DSA drafts | Drift/SQLite | Device-local |
| Tavily raw evidence | Request scope | Not permanent model memory |

---

# Trust, safety and security boundaries

## Server-side secrets

`NEBIUS_API_KEY`, `TAVILY_API_KEY`, Knowledge job credentials and storage credentials are server-only. They must never use a `NEXT_PUBLIC_` prefix or be shipped into Flutter/browser bundles.

## Prompt-injection / untrusted-data boundary

The following are considered **data, not instructions**:

- canvas labels/descriptions;
- user workspace text;
- imported DSA metadata;
- retrieved web snippets;
- Knowledge article content/metadata;
- model tool output passed back into another model round.

System prompts/tools remain server-owned. Retrieved evidence cannot redefine the available tools or grant canvas mutation authority.

## Search privacy

DSA search queries use only the current public problem/question context needed for retrieval. Private notes, approach, code and conversation history are not copied wholesale into Tavily queries.

System Design search is constrained toward public technology facts. Tool arguments are bounded and checked before external calls.

## Structured visual safety

The DSA visual tool cannot return arbitrary scripts, HTML or arbitrary SVG. It must satisfy a validated structured lesson contract that the client renders using trusted React/SVG primitives.

System Design visual analysis similarly references existing architecture IDs and semantic fields rather than arbitrary style/script instructions.

## Canvas mutation safety

The model cannot directly edit the user's document. A proposal must be authorized for the current turn, schema-valid, consistent with the latest diagram and explicitly accepted by the user. Applied changes then pass through the existing reducer/operation system.

## Realtime capability security

Room tokens are high-entropy capability secrets. Exact allowed origins are enforced for browser WebSockets. QR codes are generated locally in the client; the share URL is not sent to a third-party QR generation service.

---

# Reliability and failure behavior

ReasonAI is designed so optional intelligence can fail without corrupting deterministic application state.

### AI/provider failure

Provider deadlines and safe error contracts prevent an indefinitely hanging model call. A failed run does not become a successful durable conversation turn.

### Tavily failure

Search failure does not automatically destroy an otherwise answerable request. The model can continue with appropriately qualified text, and unsupported current facts should remain unknown rather than fabricated.

### Invalid AI visual/proposal

Invalid structured output is rejected. The original canvas/document remains unchanged.

### Knowledge candidate failure

One bad article/image/model result does not discard successful siblings in the refresh batch. Provider failures are categorized and bounded retries are applied only to retryable classes.

### Realtime slow client

A slow participant is removed rather than back-pressuring the entire room.

### Realtime reconnect

Replay/full-state fallback and deduplication allow a client to reconnect without blindly re-applying all local operations.

### Offline sync conflict

Mobile/backend sync mutations use idempotency plus row-version/conflict semantics so a stale client receives an authoritative conflict projection instead of silently overwriting newer state.

---

# Deployment topology

```mermaid
flowchart LR
    GH[GitHub monorepo]
    CI[CI / checks]
    V[Vercel\nNext.js + ReasonAI routes]
    CR[GCP Cloud Run\nFastAPI API]
    JOB[GCP Cloud Run Job\nKnowledge refresh]
    R[Render\nGo realtime]
    S[(Supabase\nAuth + PostgreSQL)]
    R2[Cloudflare R2/CDN]
    N[Nebius Token Factory\nNVIDIA Nemotron]
    T[Tavily]
    M[Flutter build / APK]

    GH --> CI
    CI --> V
    CI --> CR
    CI --> R
    CI --> M
    CR --> S
    JOB --> S
    JOB --> R2
    V --> S
    V --> N
    V --> T
    JOB --> N
    JOB --> T
```

### Current observability

The repository currently exposes/uses:

- API health/readiness endpoints;
- realtime health/readiness endpoints;
- dependency-free Prometheus metrics from the Go service;
- structured/cloud logs;
- ReasonAI runtime stages/traces and provider/tool instrumentation.

### Target observability from the HLD

The architecture has an explicit next observability layer for:

- OpenTelemetry trace propagation across Web → API → DB → AI;
- p50/p95/p99 latency;
- request/error rates;
- PostgreSQL pool pressure;
- WebSocket reconnects/room behavior;
- AI token/cost metrics;
- SLO dashboards.

This is marked as a target where the end-to-end exporter/dashboard stack is not yet fully deployed.

### Load-test model

The HLD defines k6 scenarios for:

1. Knowledge feed + authentication + event batching;
2. System Design API + AI streaming;
3. large WebSocket populations and reconnect storms.

The measurements of interest are throughput, p95/p99 latency, errors, CPU/memory and database connections rather than synthetic "AI quality" scores.

---

# Repository structure

```text
recallstack/
├── web/          Next.js web app, ReasonAI server routes, LangGraph agents,
│                 DSA workspace, Knowledge UI and System Design canvas
├── backend/      FastAPI modular monolith, PostgreSQL domain model,
│                 Knowledge service/job and offline synchronization
├── realtime/     Go WebSocket collaboration service
├── mobile/       Flutter / Riverpod / Dio / Drift mobile application
└── .github/      backend, realtime and mobile CI workflows
```

Component documentation:

- [`web/README.md`](web/README.md)
- [`web/docs/dsa-workspace.md`](web/docs/dsa-workspace.md)
- [`web/docs/system-design-reasonai.md`](web/docs/system-design-reasonai.md)
- [`web/docs/knowledge-feed.md`](web/docs/knowledge-feed.md)
- [`backend/README.md`](backend/README.md)
- [`backend/docs/knowledge-shorts.md`](backend/docs/knowledge-shorts.md)
- [`realtime/README.md`](realtime/README.md)
- [`mobile/README.md`](mobile/README.md)

---

# Local development

## Prerequisites

- Node.js 22+
- Python 3.12
- [`uv`](https://docs.astral.sh/uv/)
- Docker
- Go 1.27+ for Live Share
- Flutter SDK for the mobile client

## 1. Start the backend

```bash
cd backend
cp .env.example .env
docker compose up -d postgres
uv sync --frozen
uv run alembic upgrade head
uv run python -m recallstack.commands.seed
uv run uvicorn recallstack.main:app --reload --port 8080
```

## 2. Start realtime collaboration

```bash
cd realtime
cp .env.example .env
PORT=8081 ALLOWED_ORIGINS=http://localhost:3000 go run ./cmd/server
```

## 3. Start the web app

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

## 4. Run the mobile app

Configure `API_BASE_URL`, `WEB_BASE_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` using the mobile environment or `--dart-define`, then run the Flutter target normally.

On PowerShell, use `Copy-Item` instead of `cp` and set shell environment variables with `$env:NAME="value"`.

---

# Core environment configuration

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

Knowledge API/job and R2-specific variables are documented in [`backend/docs/knowledge-shorts.md`](backend/docs/knowledge-shorts.md).

Hackathon judge access is configured only in the deployment environment with `DEMO_ACCESS_ENABLED`, `DEMO_EMAIL` and `DEMO_PASSWORD`. Do not commit their populated values.

---

# Verification

## Web

```bash
cd web
npm run typecheck
npm run lint
npm run build
npm run verify
```

## Backend

```bash
cd backend
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
```

## Realtime

```bash
cd realtime
go vet ./...
go test ./...
go test -race ./...
go build ./cmd/server
```

## Mobile

Use the Flutter analyzer/test/build workflow from `mobile/` and the repository's mobile CI.

The repository includes focused coverage for authentication, ReasonAI agent/tool contracts, persistent conversation lifecycle, DSA visuals, System Design proposals/analysis, Knowledge feed behavior, realtime ordering/deduplication/replay, backend schema/integration behavior and mobile local-state behavior.

---

# Current vs next architecture

The architecture intentionally distinguishes what exists now from what is a planned scale/evolution path.

| Capability | Status |
| --- | --- |
| DSA LangGraph streaming agent | Implemented |
| DSA durable bounded conversation state | Implemented |
| DSA cross-conversation learner memory | Implemented behind configuration |
| System Design LangGraph tool loop | Implemented |
| Tavily-grounded System Design research | Implemented |
| Strict architecture-analysis overlays | Implemented |
| Reviewable AI canvas proposals | Implemented |
| Web realtime collaboration | Implemented, single-instance/in-memory |
| Knowledge ingestion + Nemotron enrichment + R2 | Implemented |
| Deterministic Knowledge personalization | Implemented |
| Raw Knowledge interaction event history | Implemented |
| Learned behavioral topic/source affinity | Next-stage loop in HLD |
| Mobile Feed / DSA / Ask ReasonAI | Implemented |
| Full System Design canvas on mobile | Not in current scope |
| Distributed/persisted realtime rooms | Future scale path |
| Full OpenTelemetry + SLO dashboard stack | Target architecture |
| Git repository → editable architecture canvas | Next major product extension |

---

# Design principles

1. **Reasoning is allowed to be probabilistic; state mutation is not.** AI suggestions are converted into validated contracts before they touch deterministic application state.
2. **Memory is bounded and typed.** Recent conversation, summaries, learner profile and interaction history are separate systems with separate retention semantics.
3. **Self-learning does not mean silent model retraining.** Current learning is explicit profile/memory/personalization state; future behavioral affinity remains auditable application data.
4. **Realtime transport does not own canvas semantics.** Go orders/fans out opaque operations; the product reducer remains the document authority.
5. **External research is evidence, never instruction.** Tavily results are bounded, untrusted and citation-scoped.
6. **The hot path stays cheap.** Knowledge discovery/model enrichment/image processing happen offline; feed delivery is a deterministic database read/ranking path.
7. **Users remain in control of AI edits.** Architecture proposals become real only after explicit human acceptance.
8. **Failure should degrade capability, not corrupt state.** Search, model, visual, sync and realtime failures have bounded fallback/recovery paths.

ReasonAI's long-term direction is a technical workspace that can **understand what the user is learning, what system they are designing, what evidence is current, what changed collaboratively, and what context is worth remembering — while keeping every state transition inspectable and bounded.**
