# DSA web workspace — Part 1

The DSA navigation entry opens `/dsa`. The workspace uses canonical content-item
IDs in `?problem=<id>&version=<problem_version_id>`. `/dsa/library` retains the
category dashboard; existing category and `/dsa/problem/[slug]` study-note/tutor
routes remain available.

## Behavior

- Judgment Studio has specification, editor/results, and tutor panes. Classic
  Split places the tutor behind a learning-panel button. Visual Trace starts with
  the canvas enlarged. Pointer and keyboard separators resize the panes; arrows,
  Home and End work when a separator has focus.
- Layout preferences are local to the signed-in account. Changing layouts keeps
  the editor model, result tab and existing tutor conversation mounted.
- Responsive browser navigation provides Spec, Code, Canvas, AI Tutor and Tests.
  This milestone does not change the native mobile application.
- The problem explorer debounces title search, filters by difficulty/category/topic,
  follows backend cursors, and shows authenticated learning progress/statistics.
  It fetches learning-state projections separately from specification details.
- Details and approved public fixtures are pinned to the selected specification
  version. Examples remain separate from verified fixtures. Execution eligibility comes from the separate exact-version web capabilities API; hidden case details are never exposed.
- The existing ReasonAI tutor handles progressive hints, review, complexity and
  validated visual lessons. The canvas can display these existing lessons; it is
  not an execution trace. The completed execution-aware context and tutoring modes are documented in [dsa-executions.md](dsa-executions.md).
- Notes support multiple entries, kinds, create/edit/delete, pagination and row
  versions. Conflicts retain the user's text and require explicitly loading the
  latest saved row before retrying. Progress and bookmarks use existing DSA APIs
  and invalidate the shared learning screens after changes.
- `preview=true` is an explicit reviewer mode. The UI labels it, and the backend
  checks authorization on every relevant request. Query caches include the user
  and preview context. No frontend role claim grants backend access.

## Editor and drafts

Monaco loads lazily. `predev` and `prebuild` copy its installed assets and workers
to the ignored `public/monaco/vs` directory. Browser code and editor content do not
go to a Monaco CDN. See the wrapper's [local asset configuration](https://github.com/suren-atoyan/monaco-react#loader-config).

Draft storage keys are
`reasonai:dsa:draft:1:<user>:<problem>:<version>:<language>`. Stored fields are a
schema version, code, approach, cursor and scroll state. Writes happen as edits
occur, before navigation can discard state. Storage failures are shown visibly;
the current in-memory edit remains usable. Drafts are browser-local and do not
sync between devices. Reset asks for confirmation and clears only that language's
code. No starter implementation is fabricated from a missing contract.

Python is available for drafting. Other offered languages require explicit backend
contract support and remain visibly disabled otherwise. Contract support does not
enable execution. Code and approach are bounded to the existing tutor limits of
24,000 and 12,000 characters.

`Ctrl/Cmd+K` opens the explorer. `Ctrl/Cmd+Enter` runs eligible public tests;
`Ctrl/Cmd+Shift+Enter` submits an eligible hidden suite. Both remain disabled for
unsupported languages, preview mode or missing certification. The completed
trusted execution/judging flow is described in [dsa-executions.md](dsa-executions.md). The completed ConTree connectivity setup
is documented separately in [dsa-sandbox-setup.md](dsa-sandbox-setup.md).

## Verification

Use Node 22 or newer. Regenerate API types from the checked-out backend with
`npm run api:generate`. The generated types include all registered DSA operations.

Focused browser checks:

```powershell
npm run test:e2e -- e2e/dsa-studio.spec.ts e2e/dsa-workspace.spec.ts e2e/dsa-pagination.spec.ts --workers=2 --timeout=90000
```

The populated workspace tests use isolated API fixtures and never create published
production problems. The optional `e2e/dsa-live-readonly.spec.ts` uses the configured
real public API, without mocking DSA responses or issuing learner writes. Enable
it with `DSA_LIVE_READONLY=1`. It accepts both empty and subsequently published
catalogs. Browser screenshots are written to ignored `test-results` and
`.next/cache` directories.

The production catalog currently has no approved imported specifications. An empty
explorer is expected; Part 1 does not change publication metadata or approve tests.

Verified on 2026-10-15 with Node 22.23.3:

- 11 new workspace browser tests passed, including draft and cursor recovery,
  account/problem/version/language isolation, all layouts, canvas stepping,
  fixture pagination, optimistic concurrency, storage failure, and a 390px viewport.
- The opt-in real API browser check passed: HTTP 200, zero approved catalog
  items, rendered empty state, and no learner writes or learner API requests.
- All 26 existing DSA pagination/workspace/tutor checks passed in the regression run.
- Desktop 1440×1000 and narrow browser 390×844 screenshots were inspected.
- Focused ESLint and the full TypeScript check passed after regenerating Next.js
  route types. `npm run build` completed successfully with the new `/dsa` and
  `/dsa/library` routes included.

Populated specifications and authenticated learner mutations were checked with
test fixtures. No production draft was approved, no fixture was certified, and
no production learner state was modified.

During development, Turbopack's HMR cache panicked after bulk file formatting.
Restarting with a fresh development cache restored the default Turbopack server;
the passing browser runs used it. The previous cache was retained locally at
`.next/dev-before-dsa-part1`. A temporary Webpack diagnostic attempt encountered
an unrelated pre-existing unscoped selector in `ReasonLandingPage.module.css`;
that file was not changed.
