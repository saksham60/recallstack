# System Design ReasonAI research and visual analysis

System Design keeps its existing ReasonAI drawer, Nemotron configuration and individual canvas-suggestion workflow. Research and visual analysis extend that feature; they do not create another canvas or change the saved diagram schema.

## Research flow

The authenticated `/api/reasonai/chat` handler validates the active diagram and passes the request to the existing server provider. Nemotron chooses `search_web` for material current facts (provider capabilities, quotas, pricing and documentation). Ordinary architecture reasoning needs no search. There is no required web toggle in System Design.

`src/lib/tavily/search.ts` calls Tavily's fixed search endpoint on the server. Results are normalized to title, public HTTP(S) URL and snippet. Nemotron receives them as untrusted tool evidence and synthesizes the final answer. The browser gets only the answer, optional analysis/proposal, compact cited sources and a safe notice if research failed.

Limits:

- At most two searches and four model calls per request; one search is preferred.
- 60-second total provider deadline; each search has a 7-second deadline. Browser cancellation propagates to the route/provider/search.
- Queries: 400 characters; three optional bare public domains.
- Three results per search; six unique sources total; 2,400 characters per snippet and 128 KiB per upstream response.
- Basic search, no generated Tavily answer, raw-content crawl or permanent evidence storage.

Unavailable, empty or blocked research still reaches model synthesis. Unsupported current facts must remain uncertain. Sources use IDs from the current request, including references in overlay explanations/metric evidence. Normal responses have no sources. Citation existence is validated; source relevance and interpretation remain model judgments.

The existing `NEBIUS_API_KEY`, `REASONAI_MODEL`, `REASONAI_BASE_URL` and `TAVILY_API_KEY` configuration is reused. Keys remain server-side and must never use a `NEXT_PUBLIC_` prefix. No extra environment variable or migration is required.

## Semantic visual analysis

`show_architecture_analysis` returns a strict semantic contract in `reasonai/visualization.ts`: analysis type, title, summary, assumptions, existing node/edge IDs, optional severity, label, reason and metric evidence. Supported types are **bottleneck, failure, capacity, reliability, traffic and cost**. The model cannot specify CSS, colors, HTML or arbitrary canvas properties.

Both server and client validate the result. A server-only adapter handles observed Nemotron serialization quirks (stringified arrays, an unambiguous existing edge ID under the nodeId key, exact redundant endpoints, and empty optional fields) before strict validation. It does not invent IDs, measurements or evidence. Empty unknown metrics are omitted; unsupported numeric claims still fail validation. Unknown IDs are discarded; invalid overlays receive at most one model correction within the same four-call/60-second budget, with search and proposals disabled for that correction. If correction is unsuccessful, useful text is retained without an overlay. Oversized upstream bodies are rejected. Metrics require a basis and evidence. Documented metrics also require current-request source IDs. Architecture costs must be estimates or unknown; unknown metrics do not display invented numbers. Failure views are explicitly hypothetical, and missing infrastructure icons do not prove missing capabilities.

`ReasonAIAnalysisLayer.tsx` draws a passive Konva group over the original nodes/connections in the existing interaction layer, without allocating another full-size canvas. Semantic severity maps to existing theme colors. Numbered node rings and highlighted paths correspond to expandable explanations in `ReasonAIAnalysisPanel.tsx`; selecting an annotated element reveals its explanation. The layer follows viewport transforms, local drags and remote position previews without intercepting pointer events.

Analysis lives only in workspace React state. It never enters the document, reducer, history, persistence, exports or realtime operation stream. Clear analysis removes it. Topology or architectural text changes invalidate it; geometry changes preserve it. A response based on an older diagram is discarded. Switching diagrams clears the view, and undo cannot resurrect obsolete analysis.

## Proposal safety

A visual analysis is never a change proposal. Chat/Review/Eagle default to analysis; explicit change requests or Fix mode may enable `propose_canvas_changes`. Analysis-only wording disables it. The conservative authorization check controls tool availability and validation; the final mutation boundary remains the user's explicit acceptance/drop of each suggestion and validation against the latest diagram.

The existing suggestion preview, component drag/drop, connection dependency handling, accepted operations, undo and Live Share flow remain intact. There is no new Apply All operation. One terminal structured tool response is supported: a proposal or an overlay. Research can precede either.

## Trust boundaries

Canvas metadata, history, user text and external snippets are untrusted data. They cannot redefine tools, system instructions or authorization. Search arguments are limited and checked for credentials, opaque payloads, internal domains and copied private descriptions/history. These checks reduce accidental disclosure; they cannot prove that arbitrary natural-language text contains no private information. The prompt restricts queries to public technology facts.

Configured credentials are redacted from incoming model context and retrieved evidence, and blocked if returned by the model. Provider failures use safe diagnostics, without logging raw responses, tool arguments or secrets. Research executes only against Tavily's fixed endpoint; returned URLs are not fetched by this implementation.

## Implementation map

- `reasonai/system-prompt.ts`: system prompt and per-turn mode/search rules.
- `reasonai/provider.ts`, `reasonai/research.ts`, `src/lib/tavily/search.ts`: bounded model/tool orchestration.
- `reasonai/contract.ts`, `reasonai/visualization.ts`, `reasonai/sources.ts`: typed response and validation.
- `reasonai/ReasonAIPanel.tsx`, `ReasonAISources.tsx`: conversation integration and evidence links.
- `reasonai/ReasonAIAnalysisLayer.tsx`, `ReasonAIAnalysisPanel.tsx`: passive highlights and explanations.
- `components/SystemDesignWorkspace.tsx`, `SystemDesignCanvas.tsx`: local analysis lifecycle and canvas integration.
- `src/app/api/reasonai/chat/route.ts`: existing authenticated endpoint, now propagating cancellation.

Tests cover model-selected/no-search paths, unavailable search, strict loop bounds, safe errors, secret redaction, citation integrity, visualization types/metrics/IDs, proposal authority, stale results, canvas interaction, persistence/undo and private Live Share overlays. Existing System Design and DSA regressions are also run. Live configuration checks verified all six Nemotron visualization types and automatic Tavily research followed by a sourced synthesis. The browser regression run passed 63 tests; the full state/provider run passed 214 tests, including serialization repair and safe correction failures.

The final prompt review and full reviewed prompt are recorded in [system-design-reasonai-prompt-review.md](system-design-reasonai-prompt-review.md).

Final verification: TypeScript, full lint, focused lint after the final provider correction, production build, 214 state/provider tests and 63 browser regression tests passed. Astra approved the system prompt unchanged; its provider citation finding was fixed and covered by regression tests.
