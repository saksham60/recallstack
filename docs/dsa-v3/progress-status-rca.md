# RCA: Accepted DSA submission displayed as Not started

Investigated 18 October 2026 against application commit
`922d2526c32fecf3fe5164f62b7657374e0387a5` and read-only production SQL in
Supabase project `jlqawpdsyptfxspyqnsu`. No production data or application code
was changed, and no sandbox or model requests were made.

## Confirmed production evidence

Problem: **Maximum and Minimum Element in an Array**.

- Content ID: `9766752c-8410-4a77-af63-b009c50e98f5`.
- Current problem version: `0f721138-d2ca-4959-8798-0c6e0c540f89`.
- Six completed Submit records exist, all with `accepted` and 32/32 tests passed.
- All six belong to one learner, use this current problem version, and have an
  official certificate in their frozen evaluation plan.
- Latest submission: `17fadd63-5eac-4b35-9ed4-0659c623e5f8`, completed
  `2026-10-17T13:36:13.809358Z`.
- That learner has **no `public.user_progress` row** for this content ID.
- Across production, three distinct learner/problem pairs have terminal judged
  Submit evidence but no learning-progress row. This count includes failing judge
  outcomes; it does not mean all three problems were solved.

No source code, hidden cases, expected outputs, credentials or learner identity
were retrieved for this investigation. The account was inferred from saved
submissions for the reported problem, rather than a newly authenticated browser
session.

## Root cause

Two independent persistence paths were never connected for the list status:

1. The sandbox worker saves its terminal verdict through
   `SupabaseExecutionRepository.finish` / `public.dsa_execution_command` into
   `dsa_execution_private.jobs`. It then dispatches Code Intelligence separately.
2. `useCatalogProgress` requests `/api/v1/dsa/me/progress`, backed by
   `DsaLearningRepository.list_progress`, which reads only `public.user_progress`.
3. `TopicBoard.card` uses `progress.data?.[p.id] ?? "new"`, then displays `new`
   as **Not started**. Neither this API nor the card considers saved judge results.
4. The production execution command contains no `user_progress` reference. Its
   sole non-internal jobs trigger is `dsa_provisional_result_guard`, which also
   contains no progress update. The worker has no learning-progress write either.
5. Learning progress is currently written through the explicit learner progress
   endpoint (`useLearnerChange` / the learning repository). Submitting a solution
   does not invoke that path.

The verdict is persisted correctly. The card displays a manual learning-state
projection as if it were execution completion state. The missing row is therefore
converted into a false Not started label even after an official Accepted result.

This case is **not caused by certification gating, provisional grading, a problem
version mismatch, an unfinished judge job, or failed AI report generation**.
Refreshing alone cannot repair the persisted/projection mismatch.

## Secondary issue and test gap

`useExecution` does not invalidate catalog/topic learning queries when a Submit
becomes terminal. That would leave cached lists stale after a future persistence
fix, but it is not the primary cause here: the database row is absent.

Execution browser fixtures independently mock progress as `new`. Navigation tests
check supplied progress fixtures. Neither verifies a persisted Submit followed by
returning to the board and reloading its status. The previously passing Results
Studio suite did not cover this cross-feature acceptance case.

## Recommended correction

Expose a server-authorized execution-status projection for the current learner,
keyed by content ID, and use it consistently in cards, filters and topic totals.
Keep manual confidence/mastery separate so that an Accepted submission does not
overwrite a learner's self-assessment or existing synchronization history.

- Official Accepted evidence: **Solved** / **Accepted**.
- Provisional pass: **Passed current tests**, preserving provisional provenance.
- A trustworthy failing judge result: **Attempted**.
- Pending, cancelled or infrastructure failures: preserve their actual status;
  never promote them to a pass.
- No execution evidence: fall back to the existing learning status.
- Preserve best successful evidence when a later attempt fails; retain version
  identity and define how prior-version completion is labelled.
- Derive historical status from existing saved records so affected learners do
  not need to submit again. Avoid manufacturing mastery or certificates.
- Refresh the affected query projections after terminal Submit and ensure both
  reloads and topic/dashboard counts use the same authoritative mapping.

Required regression coverage: Accepted -> board -> reload, provisional pass,
Wrong Answer, infrastructure/cancelled outcomes, later failure after success,
existing learning state, account isolation, historical records and version changes.

## Implemented correction (18 October 2026)

The Next.js backend now exposes authenticated, no-store
`GET /api/dsa/learner-progress`. The verified session supplies the owner ID;
request parameters cannot select another learner. It invokes the read-only,
service-role-only `public.dsa_learner_execution_progress(uuid)` function. Anonymous
and authenticated raw RPC callers have no execute privilege. No private schema
was exposed, no table grants were broadened, and the function is security invoker.

Migration `20261018063615_dsa_learner_execution_progress.sql` was applied once.
The CLI proposal was renamed to Supabase's actual ledger timestamp. All 66
production/local migration versions and SQL hashes match under explicit UTF-8,
CRLF-to-LF and boundary-trim normalization. Earlier ledger hashes were recomputed
under that exact method; no existing migration was modified or replayed.

The projection reads current published DSA problems, manual learning status and
owner-scoped Submit evidence. It never returns source, plans, hidden cases, logs,
reference solutions or model evidence. Best current-version official/provisional
passes survive later failures. Older-version passes receive a separate label and
do not count as current completion. Runs cannot mark a problem solved. Pending,
cancelled and infrastructure outcomes remain separate from passing evidence.

The topic board, completion filters, topic summaries and workspace problem
explorer share one account-scoped progress query and one status/count mapping.
Terminal Submit invalidates that query. Missing/unavailable requests display
loading/unavailable status instead of pretending the learner has not started.
Self-assessed confidence/mastery and the existing learning write/sync APIs remain
independent.

Read-only production verification returned `executionStatus: solved` and
`learningStatus: new` for the reported problem, using its existing submissions.
Judge result and manual progress fingerprints were identical before and after:
`6a685b12947b39f818f8fee5e2ae67f9` and
`017fba851061397c5858d3043da0bb4f`, respectively. Security advisor findings were
unchanged after excluding their observation timestamps.

Validation uses Node 22 from `web`:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/dsa/progress src/app/api/dsa/learner-progress/route.ts src/features/dsa/navigation/TopicBoard.tsx src/features/dsa/navigation/TopicHome.tsx src/features/dsa/navigation/api.ts src/features/dsa/workspace/Explorer.tsx src/features/dsa/workspace/api.ts src/features/dsa/execution/use-execution.ts src/lib/reasonai/authenticated-request.ts scripts/test-dsa-database.mjs e2e/helpers/dsa-v3.ts e2e/dsa-results-studio.spec.ts e2e/dsa-progress-unit.spec.ts e2e/dsa-navigation.spec.ts
node scripts/test-dsa-database.mjs
node node_modules/@playwright/test/cli.js test --config=playwright.execution.config.ts e2e/dsa-progress-unit.spec.ts e2e/dsa-execution-unit.spec.ts e2e/dsa-report-unit.spec.ts
node node_modules/@playwright/test/cli.js test --config=playwright.studio.config.ts --project=chromium --workers=2 --reporter=line
npm run build
```

The new cross-feature browser check submits through controlled authenticated API
fixtures, navigates back to a preloaded board, filters Solved, reloads, and checks
topic totals and preserved manual mastery. Separate cases cover provisional,
failed/attempted, infrastructure, unavailable progress and anonymous API rejection.
The first cross-feature run exposed an incomplete topics response in the test
fixture; that fixture was repaired and the cross-feature rerun passed. Production
functional verification still belongs to the user; no paid sandbox or AI test
was performed. The existing 375 independent fixture checks were not repeated.

Final checks passed: **66/66 browser checks**, **24/24 focused unit checks**,
the disposable database suite, TypeScript, targeted ESLint, and the Node 22
production build (exit 0). Local build emitted its existing QueueClient region
fallback warning; Vercel supplies the production region. No queue/provider test
request was made by the build. Evidence: `artifacts/dsa-progress-fix-verification.json`.
Main SHA and Vercel READY metadata are reported with release.
After deployment, reload `/dsa/arrays` and find **Maximum and Minimum Element in
an Array**: its existing official Accepted record should show **Solved**. Choose
the Solved filter, reload, then check the corresponding topic's solved total.
