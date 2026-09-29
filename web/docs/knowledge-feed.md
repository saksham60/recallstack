# Knowledge Feed integration

`/feed` is the default signed-in landing page. Its public shell shows a sign-in prompt for guests; feed data still requires the existing authenticated API. The feed uses the backend's per-user preferences API and optional Cloud Run refresh endpoints. No web runtime dependency was added.

## Behavior

- Centered 610px feed with uncropped 4:5 CDN images, reserved image space, an eager first image, lazy later images, matching skeletons and a branded image fallback.
- Ten stories per request, a 1,000px prefetch margin, duplicate prevention and manual recovery after pagination failures. No feed polling or automatic reordering. At 100 buffered stories, “Continue reading” deliberately starts the next batch and releases the previous batch. Recent feed pages stay in memory for five minutes after navigation; feed data is not persisted to browser storage.
- The primary navigation uses nine fixed broad categories (including For You); detailed topics stay in the story data and detail view. Category selection uses the existing `topic` query. The backend also supports an optional `source` filter; types include it, but this screen currently filters by category.
- “Customize your feed” fetches preferences only when opened. Users can choose multiple interests and save a free-text interest prompt. The backend stores the prompt per user and uses up to 12 distinct terms to raise matching existing stories in that user's ranking, without an AI call on feed requests. Saving preserves detailed-topic and source preferences and restarts pagination because old cursors no longer match the user's preferences.
- During a staggered deployment, an older API response without `interestPrompt` keeps category editing available and hides the prompt field until the updated API is live.
- At the end of available stories, signed-in users can request one shared Cloud Run refresh when the API reports a configured Job. The browser polls its authenticated status endpoint every ten seconds while active and refreshes the feed on completion. A backend-wide cooldown prevents repeated paid runs; a completed run does not guarantee additional stories.
- Cards show a short summary and Why it matters preview, with full text in details. The full card body opens details while Save, Share and source links remain independent.
- On focus after five minutes, a first-page check can offer a non-numeric New stories pill when a newly published story is observed. This check leaves the anchored reading queue and scroll position unchanged. The pill and manual Refresh explicitly start a fresh feed session; the API does not supply an exact new-story count.
- `/feed?story=<uuid>` opens accessible native-dialog details. Browser Back, Escape and Close preserve feed scroll and restore focus. Share uses branded native share text where available, otherwise copies this internal link. On Vercel, links use the production project URL when exposed by the platform. The public page exposes a generic ReasonAI Open Graph preview without revealing private story content, and sign-in preserves shared story links.
- Save/Unsave sends durable events and updates both list and detail caches after acknowledgement. `viewerState.saved` hydrates the control after reload. Retries reuse the same event UUID. Failures leave the previous state intact.
- Not interested hides a story from the user's feed through a durable event; Undo restores it and refetches the feed.
- VIEW, OPEN, SHARE and ASK_REASONAI analytics use bounded, best-effort batches; Save is a separately acknowledged mutation. Analytics may be dropped when leaving the page.
- Ask ReasonAI reuses the existing composer, safe Markdown renderer, session-refresh transport, Token Factory transport, provider SSE decoder and ReasonAI streaming protocol. The selected story is attached as structured context, never dumped into the visible conversation. Quick questions cover explanation, relevance, architecture, examples and interview preparation.
- Story chat stays in memory while its dialog is open, including switching back to details. Closing the dialog aborts the request and clears that conversation. History sent to the provider is bounded to 12 messages. No database conversation surface or migrations were added.

## API and authentication

Feed requests use the existing generated `openapi-fetch` client and Supabase bearer credentials. An expired session gets at most one refresh/retry. Exhausted authentication shows the existing login path. Query caches are scoped to the signed-in user. Errors never display raw backend diagnostics.

Endpoints:

| Endpoint | Use |
| --- | --- |
| `GET /api/v1/knowledge/feed?limit=10&cursor=…&topic=…` | Cursor pagination and topic filters |
| `GET /api/v1/knowledge/stories/{storyId}` | Deep links and canonical chat context |
| `POST /api/v1/knowledge/events/batch` | Durable Save/Unsave and interaction analytics |
| `GET/PATCH /api/v1/knowledge/preferences` | Read and save interest categories |
| `POST /api/v1/knowledge/refresh-runs` | Request a shared story-discovery run |
| `GET /api/v1/knowledge/refresh-runs` | Show discovery only when the job is configured |
| `GET /api/v1/knowledge/refresh-runs/{runId}` | Poll progress after requesting a run |
| `POST /api/reasonai/knowledge/chat` | Web server story-context entry to ReasonAI |

Actual story fields: `id`, `title`, `summary`, `whyItMatters`, `source.key`, `source.name`, `sourceUrl`, `imageUrl`, `publishedAt`, `topics`, `importanceScore`, `qualityScore`, `viewerState.saved`, `viewerState.seenAt`. The feed envelope is `items`, `nextCursor`, `hasMore`. Scores and `seenAt` are accepted without inventing extra UI semantics.

The chat handler verifies Supabase authentication, enforces same-origin requests when Origin is supplied, bounds/validates input, and re-fetches the story with the user's bearer token before calling the provider. Client-supplied story text cannot override canonical context. Expired or inaccessible stories never reach the provider. Provider credentials stay server-side. The answer is grounded in the summary, with no claim of having retrieved the full source article or searched the web.

The backend retains active stories for seven days and returns ready-to-use R2/CDN image URLs. The UI has no storage credentials or provider-specific image URL construction. Categories are represented by topic keys; there is no categories endpoint or linked DSA/System Design problem metadata. Accordingly, no invented related-problem links are rendered.

The backend must enable Knowledge and deploy the merged viewer-state contract. `npm run api:generate` now exports the checked-out application's schema instead of relying on the stale checked-in `backend/openapi.json`, and writes only the generated web types. Source files in `backend` remain untouched by this generator.

On September 27, 2026, the configured deployed API's `/openapi.json` was checked: Knowledge feed, `viewerState` and the source filter are all present. This confirms the deployed contract; it does not establish availability of authenticated production stories.

## Files

Created:

- `src/app/(app)/feed/page.tsx`, `src/app/api/reasonai/knowledge/chat/route.ts`
- `src/features/feed/{index.ts,model.ts,api.ts,use-feed.ts,FeedScreen.tsx,StoryCard.tsx,StoryDetail.tsx,StoryChat.tsx,reasonai.ts}`
- `src/components/reasonai/{ReasonAIComposer.tsx,ReasonAIMarkdown.tsx,markdown.css}`
- `src/lib/http/safe-external-url.ts`, `src/lib/reasonai/server/{provider.ts,provider-sse.ts}`
- `scripts/generate-api.mjs`, `e2e/{feed.spec.ts,feed-reasonai.spec.ts}`, this document

Modified:

- `src/components/layout/{TopNavigation.tsx,AdminNavigationLink.tsx}`: Feed navigation and active states.
- `src/features/dsa/reasonai/{DSATutorComposer.tsx,DSATutorMarkdown.tsx,contract.ts,provider.ts,provider-sse.ts,tutor.css}`: extract existing shared primitives; preserve DSA behavior.
- `src/lib/api/{client.ts,types.ts}`: preserve Request abort signals and regenerate the real contract.
- `src/lib/reasonai/authenticated-request.ts`, `src/proxy.ts`: register the authenticated story chat route.
- `playwright.config.ts`, `playwright.system-design-state.config.ts`: register tests in the appropriate existing suite.
- `e2e/reasonai-persistence.spec.ts`: align one stale assertion with the existing deliberate interrupted-run fallback; no persistence behavior change.
- `package.json`, `README.md`: current-schema generation and integration documentation.

## Backend-dependent follow-up

Persisted chat history for the Knowledge surface would require extending the backend's existing conversation contract. Related DSA/System Design actions require real association metadata. Neither capability is fabricated in this implementation. Saved-state hydration is implemented; it is no longer a backend TODO after PR #3.

## Verification

Commands use Node 24 for this checkout because the default shell's Node 20 is below the app's declared Node 22 minimum. No machine-wide Node installation or package dependency was changed.

- `npm run api:generate`: passed, generated from the merged backend.
- `npm run typecheck`: passed after route types were generated.
- `npm run lint`: passed.
- Focused provider/authentication/streaming tests: 71 passed before the merge; the additional canonical-route test also passed.
- The first full state run passed 450 tests and exposed one pre-existing stale assertion in `reasonai-persistence.spec.ts`. The existing implementation deliberately falls back to `interrupted` after terminal persistence fails, but this assertion still expected `completed`. The test now checks the documented interrupted fallback and ensures the assistant transcript is not duplicated. Persistence implementation is unchanged.
- All 15 feed browser tests passed after the UI update, including cursor buffering, deduplication, fixed-category filtering, 4:5 media, fresh-story indication without automatic reordering, details/back/scroll/focus, broken images, Save retry idempotency, persisted saved state after reload, sharing, HTTP 401/403/429/500, expired deep links, streaming chat and mobile overflow checks at 360px, 390px, 768px and 1280px. Desktop and mobile screenshots were inspected.
- The 23-test targeted feed/provider/persistence rerun passed after the stale persistence assertion was corrected.
- The eight feed/ReasonAI contract tests, typecheck, lint and production build passed. The broader browser suite still has four failures to isolate separately; this UI change did not modify those unrelated tests.

Feed browser tests use realistic API fixtures and mocked model streams, never a production data fallback. Feed checks do not spend AI credits or insert production stories. The broader pre-existing DSA suite includes direct server integration requests with the configured provider, unlike the mocked feed tests. Production story/image availability remains separate from fixture-based UI verification.
