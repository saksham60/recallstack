# DSA learning workspace

`/dsa/problem/[slug]` loads the existing published content API through `useStudyNote`.
Old `/content/[slug]` URLs delegate DSA entries to the same workspace with the already loaded note. Other content domains retain `StudyNoteScreen` and its renderer.

The primary imported practice resource remains the problem source. The workspace reads optional companies and remarks from the importer's existing `recognize.payload.source` data. It does not introduce problem statements, migrations, inferred topics, or external-content persistence.

Approach, code, chat and composer draft are temporary React state scoped to the current problem. Switching tabs, resizing or collapsing the tutor preserves them; leaving/reloading the page resets them. Notes, bookmarks, practice attempts and revision scheduling use the existing backend features. Saved notes currently loaded by the notes API are included in tutor context, bounded to 12,000 characters.

The desktop split starts at 60% workspace. Drag the divider, use its arrow/Home/End keys, or double-click to reset. **Focus on tutor** opens a full-width teaching stage; **Workspace** or Escape restores the split with the original edits and reading position. Mobile/tablet use workspace tabs and the same focus stage. **Larger text** increases answer text size. New answers open at their beginning instead of scrolling past long explanations.

Tutor answers use safe Markdown with formatted headings, code and scrollable comparison tables. Raw HTML, embedded images and unsafe link schemes are disabled. **Visual walkthrough** and **Trace an example** offer Nemotron the bounded `present_visual_lesson` tool: array/pointer snapshots, graph/tree snapshots or matrix/DP snapshots with captions and variables. In focus mode, Walkthrough and Conversation views give the diagram room alongside its controls. **Ask about this step** sends the selected lesson/step as untrusted viewing context with the learner's next question. Playback pauses when the stage is hidden.

The client renders validated React/SVG primitives with previous/next, playback and scrubbing controls. The model cannot submit scripts, HTML, arbitrary SVG or execution instructions. Illustrative examples are labeled separately from user/source examples. Missing context or malformed visuals degrade to clarification/prose or a safe retry error. Tool availability does not grant permission to reveal a complete solution.

## Server configuration

Reuse `NEBIUS_API_KEY`, `REASONAI_MODEL` and `REASONAI_BASE_URL` from the existing server configuration. Optional `TAVILY_API_KEY` enables linked-page retrieval and Search web. Visual lessons use the same Nemotron model and require no additional key. Put credentials in ignored `.env.local` for local development, or the deployment environment's secret settings. Restart/redeploy after configuration changes. Never use `NEXT_PUBLIC_` for either credential.

## Tutor and search

`POST /api/reasonai/dsa/chat` is an independent authenticated JSON contract. Its handler authenticates with Supabase and returns JSON 401s; the proxy lets this exact path reach the handler instead of redirecting it to HTML. The existing non-production E2E bypass is respected. Origin checking, streamed body limits, field validation, provider deadlines and bounded responses apply.

The system prompt and action instructions live in `src/features/dsa/reasonai/provider.ts`. The tutor separates imported metadata, user workspace text and transient web evidence. It treats all three as untrusted data. Initial hints are conceptual; further hints increase direction without automatically revealing a solution. Empty review/complexity actions ask for an approach. The model is instructed to qualify any inference even when it recognizes a title.

The model always receives the current title, URL, provider, category, difficulty and imported summary together with the user's work. Knowing which problem is open is distinct from knowing its exact requirements. The prompt resolves "this problem" to the open entry while prohibiting reconstruction of requirements from a title. For example, InterviewBit's "3 Sum" asks for a sum closest to a target; it must not inherit LeetCode 3Sum's zero-sum requirements.

Source-dependent help automatically tries the linked page through Tavily Extract, then a source-domain search and a broader fallback. When the linked page appears in search, its requirements take priority over neighboring articles. Search web explicitly requests fresh references using the current question; the related-problem web action also enables it. Only the question and public title/provider/source form search queries. Separate notes, approach, code and conversation history never go to Tavily.

Retrieved evidence is bounded and sent as context to Nemotron, which synthesizes the answer. Compact source links appear under web-grounded answers. For follow-up turns, public source evidence is carried in an HMAC-signed, 15-minute token bound to the current problem and kept only in React memory. The server verifies the token before using its evidence; ordinary client conversation text is never treated as verified retrieval. This works across serverless instances without a database or new signing secret. Tokens do not contain workspace notes/code and are not refreshed indefinitely. Clear chat drops the token. Retrieved statements are never persisted.

The integration uses the [Tavily Extract API](https://docs.tavily.com/documentation/api-reference/endpoint/extract) and [Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), with fixed provider endpoints, request/response limits and timeouts. Private/literal-IP source hosts are excluded from retrieval. Extract/search failures preserve normal Nemotron tutoring and the external practice link. If evidence is missing or incomplete, the tutor asks for only the relevant details. The whole tutor request is limited to 512 KiB, including workspace text, history and the signed evidence token.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:system-design-state` includes DSA contract/provider tests and existing System Design coverage.
- `npx playwright test e2e/dsa-workspace.spec.ts e2e/practice-links.spec.ts e2e/notes.spec.ts e2e/bookmarks.spec.ts e2e/security.spec.ts e2e/revisions.spec.ts e2e/auth.spec.ts e2e/reasonai.spec.ts --workers=2 --reporter=line`

Automated provider tests mock upstream requests and do not spend API credits. They validate contracts, prompt/data separation, bounded bodies, source-aware queries, secret/error handling and graceful search failures. Browser tests cover workspace review payloads, progressive hint state, sources, editor validation, retries, mobile tabs, legacy URLs and JSON authentication errors. Pedagogical response quality still depends on the configured model.
## ReasonAI DSA durable memory

DSA V2 keeps its user-visible transcript in the ReasonAI product tables and its compact model memory in LangGraph checkpoints. Production requires the server-only `DATABASE_URL` and `REASONAI_THREAD_SECRET` variables. `DATABASE_URL` should use Supabase's serverless-compatible pooler connection string with SSL enabled. The thread secret must contain at least 32 bytes and remain stable across deployments.

Initialize or migrate the package-owned checkpoint tables once for each hosted database:

```bash
npm run reasonai:checkpoint:setup
```

This creates LangGraph's tables in the `reasonai_graph` schema. Application requests never run checkpoint setup.

## ReasonAI DSA tools and learner memory

With `REASONAI_V2_MODE=dsa`, the DSA LangGraph agent exposes two bounded tools to Nemotron: `search_web` and `create_visual`. Ordinary conceptual answers remain a single streaming model pass. Tavily runs only after the model selects `search_web`; results are limited to five public URLs with 1,500-character snippets, treated as untrusted evidence, and removed from checkpoint state after the run. `create_visual` reuses the existing strict visual lesson validator. The server permits at most four tool rounds and emits the shared runtime tool/source/visual events with stable call IDs.

Cross-conversation learner memory is independent from checkpoint conversation memory. It defaults off. Set `REASONAI_MEMORY_MODE=dsa` to read at most eight user-owned DSA tutoring facts and extract at most three bounded facts after a successful authoritative answer. Cancelled, failed and interrupted runs never write learner memory. The profile stores only tutoring preferences, strengths, misconceptions, goals, strategies and progress; it does not store transcripts, provider reasoning or web payloads.

Apply `supabase/migrations/20260920_reasonai_learner_memory.sql` before enabling learner memory in a hosted environment. The table uses row-level security with `auth.uid() = user_id` and semantic upserts on `(user_id, surface, memory_key)`. This migration and the environment flag are separate from LangGraph checkpoint setup.

## ReasonAI DSA lifecycle hardening

Apply `supabase/migrations/20260921_reasonai_runtime_hardening.sql` after the transcript and learner-memory migrations. It adds the run `heartbeat_at` lease, an atomic acquisition/stale-recovery RPC, and an atomic assistant-transcript/final-run RPC. Both functions are security-invoker functions with an empty `search_path`, enforce ownership through `auth.uid()`, and are executable only by `authenticated`. ReasonAI table grants and RLS policies are explicit; `anon` has no table or RPC access.

A running row is a 120-second lease. The server refreshes it at most every 12 seconds while generation is active. A later request atomically changes an expired run to `interrupted` with `RUN_LEASE_EXPIRED` before it acquires a new run. Reusing the expired run's idempotency key replays that interrupted result instead of executing the model or tools again; a new key acquires a new run. Terminal states are immutable, so a late invocation cannot overwrite cancellation or stale recovery.

The NDJSON response uses one serialized pump. After the first client pull, it continues through terminal persistence without requiring another client read. Cancellation and encoding failures share one idempotent close path that awaits the source iterator's `return()`. Graceful disconnect cleanup finalizes the run as completed when durable completion already won, otherwise as interrupted. If the process disappears without cleanup, the finite lease provides the independent recovery path.

Provider streaming has a 30-second first-event timeout, a 30-second idle timeout, and a 60-second provider deadline. Graph tools have a 15-second deadline. The browser uses first-event and resettable idle timers rather than a fixed total-duration timer, so an active response is not stopped only because its total duration crossed 65 seconds.
