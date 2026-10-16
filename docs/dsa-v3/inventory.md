# DSA V3 inventory

Baseline: `11e6a7a`, inspected 2026-10-16. Web only. Production schema and content
are owned by a separate Supabase workstream; no V3 production mutation is authorized
by this inventory. Reviewed content/metadata handoff is pending.

## Reuse

- Canonical FastAPI catalog, exact-version details, public fixture pagination,
  notes/bookmarks/progress APIs, publication and reviewer authorization.
- Monaco with self-hosted assets; account/problem/version/language-scoped drafts,
  pane layouts, notes conflict handling, existing ReasonAI streaming tutor/canvas.
- Private execution jobs, authenticated Next API, durable Vercel queue/outbox,
  ConTree/Nebius isolation, trusted TypeScript judge and fenced five-slot limit.

## Corrections and migration

- `/dsa` currently renders a flat workspace/explorer. Replace with topic home.
- `/dsa/library` and UUID category pages expose the old catalog. Redirect/migrate.
- `/dsa/problem/[slug]` and `/content/[slug]` still render a second study/tutor
  workspace. Resolve to the canonical workspace; preserve generic non-DSA content.
- Keep existing IDs/draft keys and learner data; migrate URLs without rewriting
  saved code when a contract changes. Version queries must remain exact.
- Local worker hardcodes `solve`, canonical JSON equality and a 20-case cap;
  cold-start shares a 30-second execution timeout. Replace with a shared harness.
- Current direct Submit falls back to durable unverified practice attempts.
  V3 requires exact-source public-pass UX eligibility and genuine hidden judging;
  retain historical records, remove this fallback from the final judged flow.
- Current starter is an intentionally untyped `*args/**kwargs` scaffold, not a
  certified Python signature. Typed templates require reviewed versioned contracts.

## Database and metadata dependencies

Personal board layouts/collections with CAS row versions and owner RLS; reviewed
company associations; public adapter registry/revisions; private certification
ledger, report jobs/reports and skill history. See supabase-handoff.md.
Publication is not execution certification. The old zero-published release report
and issue #19 cohort counts are historical; audit before reporting current totals.

## Security and correctness

Never expose hidden fixtures/reference implementations to browser or tutor. Preserve
auth/origin/ownership/rate checks and exact-version eligibility. Worker CSP already
restricts network to the runtime CDN; verify real interpreter/FFI isolation, output
limits, same-origin access denial, cancellation and restart. Harness source parity
also needs explicit CPython/Pyodide semantic compatibility tests.
AI reports cannot change verdicts; reuse keys must include suite/contract/checker/
harness/model/rubric revisions. Certification must not be fabricated by SQL flags.

## Verification baseline and missing evidence

Existing API/unit/DB execution tests, UI fixtures and opt-in provider smoke exist.
Local-run browser tests substitute a JS worker; these are not interpreter evidence.
The supplied HTML was exercised with actual Pyodide: 3/3 public examples, 8/8 demo
fixtures, negative code, filters, drag ordering and draft refresh. This does not
verify the application runner, hosted judge or reports. V3 still needs unmocked
interpreter coverage, route migration regression, actual approved 3Sum queue/VM/
judge/report evidence and a truthful complete-catalog manifest.

Paid live verification budget: at most FIVE external Nebius/AI calls combined,
including retries. Calls used by this workstream: ZERO. No automatic bulk live runs.

## Read-only production readiness inventory (2026-10-16)

Confirmed through SELECT-only Supabase queries: 375 definitions, 750 versions,
375 current published/statement-approved versions. Ten current suites are published
with public/hidden certificates; 365 suites remain `needs_review`. This is existing
readiness metadata, NOT V3 independent certification evidence. The V3 personal-board
table is not installed. `artifacts/dsa-v3-catalog-inventory.json` records all 375
problem/version/suite IDs and their existing readiness, without fixture contents.

Canonical 3Sum: problem `6bf047e9-6735-4892-b063-f59e4c8ce29f`, version
`62b831b6-4c58-438e-9442-a78be83e3469`, slug `ultimate-dsa-016-3sum`, suite
`c34f14dd-3de2-4199-bf8f-67d0db67f9fb`. Statement published; suite needs review;
no execution certificate. Genuine live 3Sum proof requires independent suite and
contract repair/certification first. No SQL flags were changed to bypass this.
