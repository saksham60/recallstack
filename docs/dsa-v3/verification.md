# DSA V3 verification

Story: signed-in learner opens topics -> canonical catalog/progress -> topic board
-> exact-version workspace -> existing learner APIs, tutor and saved drafts.

## Checkpoint 1 (2026-10-16)

| Boundary | Evidence | Limit |
|---|---|---|
| Topic/board/workspace rendering | Inspected desktop screenshots; narrow browser and no-overflow checks | UI fixtures, not production content verification |
| Browser -> API contract | Canonical redirects, exact versions, all summary pages, composed filters, bookmarks/notes, CAS rollback | Browser fixtures and loopback server routing fixture |
| API -> existing data | 42 API tests + PostgreSQL integration coverage for resolver and per-user visible counts | Disposable local PostgreSQL |
| Personal storage -> response | Real migration applied in isolated DB; owner RLS/CAS and metadata privacy tests; 14 integration checks total | Proposed migration not installed in production |
| Response -> UI | Full browser regression: 180 passed, 1 opt-in real API check skipped | Skipped check is not counted as real-provider proof |
| Execution regression | 15 judge/lifecycle/tutor-context unit tests passed | Mock sandbox adapters; no paid live call |
| Static quality | Ruff, mypy, ESLint, TypeScript and Next production build passed | No deployment claim |
| Production readiness data | SELECT-only inventory: 375 published, 10 certificates, 365 needs-review suites | Existing flags are not V3 certification |

Screenshots copied outside Playwright's disposable output to:
`web/.next/cache/dsa-v3-checkpoint-1/{dsa-v3-home,dsa-v3-board,dsa-v3-workspace}.png`.
The images use named UI fixtures and make no real grading or report-generation claim.

## Pending production boundary

`public.dsa_personal_boards` is absent in production (confirmed read-only). The
separate Supabase owner must review/apply the proposed migration and return its
environment/version and relationship/RLS checks before hosted persistence can be
claimed. Company metadata must come from reviewed sources supplied by the user.

The backend resolver/topic-progress additions must deploy before the web routes.
Canonical 3Sum has an uncertified needs-review suite; no live judge or AI report
evidence has been claimed. Remaining checkpoints need the shared harness,
independent content certification, report persistence and deployed runtime checks.

Paid external verification calls used: 0 of maximum 5 combined, retries included.
