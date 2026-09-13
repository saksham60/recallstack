# DSA learning workspace

`/dsa/problem/[slug]` loads the existing published content API through `useStudyNote`.
Old `/content/[slug]` URLs delegate DSA entries to the same workspace with the already loaded note. Other content domains retain `StudyNoteScreen` and its renderer.

The primary imported practice resource remains the problem source. The workspace reads optional companies and remarks from the importer's existing `recognize.payload.source` data. It does not introduce problem statements, migrations, inferred topics, or external-content persistence.

Approach, code, chat and composer draft are temporary React state scoped to the current problem. Switching tabs or collapsing the tutor preserves them; leaving/reloading the page resets them. Notes, bookmarks, practice attempts and revision scheduling use the existing backend features. Saved notes currently loaded by the notes API are included in tutor context, bounded to 12,000 characters.

## Server configuration

Reuse `NEBIUS_API_KEY`, `REASONAI_MODEL` and `REASONAI_BASE_URL` from the existing server configuration. Optional `TAVILY_API_KEY` enables Search web. Put credentials in ignored `.env.local` for local development, or the deployment environment's secret settings. Restart the server after configuration changes. Never use `NEXT_PUBLIC_` for either credential.

## Tutor and search

`POST /api/reasonai/dsa/chat` is an independent authenticated JSON contract. Its handler authenticates with Supabase and returns JSON 401s; the proxy lets this exact path reach the handler instead of redirecting it to HTML. The existing non-production E2E bypass is respected. Origin checking, streamed body limits, field validation, provider deadlines and bounded responses apply.

The tutor separates imported metadata, user workspace text and transient web evidence. It treats all three as untrusted data. Initial hints are conceptual; further hints increase direction without automatically revealing a solution. Empty review/complexity actions ask for an approach. Exact-context questions with metadata alone ask for relevant details or Search web. The model is instructed to qualify any inference even when it recognizes a title.

For tutoring without retrieved evidence, the model receives category, difficulty and provider together with the user's actual work; problem identifiers and generated summary are withheld to reduce memorized answers to an unverified variant. The complete link metadata remains available to the UI and server-side search. Metadata-only hints use a conceptual starting question until the learner supplies context or enables search.

Search web is explicitly opt-in for each composer state; the clearly labeled related-problem web action also enables it. Only the current question and problem title/provider/source are used to form the Tavily query; separate notes, approach, code and history fields are not sent to search. A question typed into the composer is itself part of the search query when Search web is on. Exact-context requests prefer the original source domain. Search results are bounded and sent as evidence to Nemotron, which synthesizes a concise answer. Only source titles/URLs accompany the answer. Search failures produce a notice and allow ordinary tutoring to continue.

The integration follows the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), with explicit basic search depth, result limits, and no generated Tavily answer or raw-content fetch. Retrieved content is never saved in the database. Client conversation history is not trusted as verified source evidence.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:system-design-state` includes DSA contract/provider tests and existing System Design coverage.
- `npx playwright test e2e/dsa-workspace.spec.ts e2e/practice-links.spec.ts e2e/notes.spec.ts e2e/bookmarks.spec.ts e2e/security.spec.ts e2e/revisions.spec.ts e2e/auth.spec.ts e2e/reasonai.spec.ts --workers=2 --reporter=line`

Automated provider tests mock upstream requests and do not spend API credits. They validate contracts, prompt/data separation, bounded bodies, source-aware queries, secret/error handling and graceful search failures. Browser tests cover workspace review payloads, progressive hint state, sources, editor validation, retries, mobile tabs, legacy URLs and JSON authentication errors. Pedagogical response quality still depends on the configured model.
