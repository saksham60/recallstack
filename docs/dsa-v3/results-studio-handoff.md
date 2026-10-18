# Results Studio and Code Intelligence reliability handoff

Implementation dates: 17–18 October 2026. Scope: web DSA UX and automatic Code Intelligence.
Design reference: `Product Details/Architecture/DSA/reasonai_results_studio.html`.

**Manual production acceptance is pending. This is not a code-freeze approval or a claim that a new production sandbox/model journey passed. No paid production verification calls were made for this change.**

## A. Root cause and recovery

Read-only production inspection found report `8f42990e-02ff-4b21-858b-a55be093453c`
queued with no worker lease. Its source submission was created on 15 October,
before the configured automatic-discovery boundary of 17 October at 06:00 UTC.
The earlier failed-report repair correctly requeued it, but the same date filter
also excluded existing reports from recovery dispatch. Worker claims independently
received that cutoff and acknowledged old admitted reports as done. An owner-scoped
retry could publish an old report while its consumer still refused to claim it.

Two other verified delivery problems increased recovery latency: partial queue
publication failures were returned as a count and then swallowed after judging;
the scheduled fallback runs daily. Retryable provider failures also used a fixed
30-second delay rather than exponential backoff.

The fixes separate discovery from recovery:

- The date boundary still controls discovery of new automatic work. Existing
  admitted reports can be dispatched and claimed regardless of source age.
- An authenticated report-status read can recover its owned submission, including
  an expired generating lease or an older report. A completed report is unchanged.
- Publication/storage failures keep the original execution delivery retryable.
  A terminal execution is idempotent on redelivery, so this does not respawn its
  sandbox. Report dispatch failures do not use the execution delivery-count cap.
- Provider retries use 30, 60, 120, 240, then at most 300 seconds. The database
  persists that delay; leases, fencing tokens and dispatch generations remain.
- Repeated owned manual retries reuse the existing report and do not judge again.

**Quotas are unchanged:** ten report records per user per UTC day, two active
provider workers globally, existing execution admission/rate limits, bounded
completion tokens and request timeouts. Retry attempts are not reset or capped.

Failure possibilities remain: provider/storage/queue outages, permanent invalid
provider output, exhausted daily quota, and interrupted workers. An ambiguous
external response followed by lease expiry can require another provider request;
exactly-once external execution is not claimed. The existing daily recovery sweep
is retained. Immediate delivery, queue retries and authenticated status reads
normally recover earlier; a closed browser plus a prolonged delivery outage can
leave recovery waiting for that sweep. A pending review's existing bounded client
polling window ends with an explicit status-refresh action.

The recovered legacy report was not sent to a production model during testing.
Its next normal queue/recovery delivery or an owned status check can resume it.

## B. Implementation

- The ReasonAI panel has **Tutor / Results / History** tabs. Submit opens Results
  immediately, shows real execution status and the saved judge result, then maps
  actual queued/generating/completed/failed/rate-limited report states.
- Detailed Code Intelligence moved out of the bottom test pane. That pane retains
  examples, public/custom local Runs, execution receipts, logs and recovery tools.
- Results use verdict cards, actual optional measurements, complexity estimate
  cards, Overview/Correctness/Optimize sections, read-only submitted source,
  Copy summary, and Discuss with ReasonAI. AI-only failure exposes Retry AI Review.
- There is one report query per selected submission, keyed by owner and ID. It
  consumes abort signals, polls pending states only, stops at terminal states,
  and resumes pending historical work when reopened. Old responses cannot replace
  the newly selected submission's view.
- History selects a saved verdict/report without remounting Monaco or the Tutor
  conversation. Latest submission context can be recovered from persisted history
  even when there is no browser-local execution pointer. Source viewing/copying is
  read-only; there is no automatic restoration into the editor.
- Discuss sends a submission ID through the existing authenticated conversation.
  The server loads the owned original source and submitted language, validates
  problem/version and terminal judge state, and supplies bounded structured saved
  analysis. Current draft notes/approach/public Run evidence are excluded from that
  selected-submission context. Caller-supplied privileged evidence is rejected.
  The discussion remains on that source until the user selects current editor
  context or explicitly starts a current-draft review.
- Monaco keeps its existing model, draft storage, keyboard shortcuts and resizing.
  Its dark syntax palette, gutter, line spacing and scrollbars follow the design.
  Judgment Studio uses three panes; Classic/Visual retain their existing assistant
  overlay behavior. Responsive Results have their own scroll region.

No problem statement, fixture, certificate, existing report document, historical
submission, model choice, unrelated feature, or production environment variable
was modified. Run remains optional and certification remains independent of Submit.

## C. Files and commits

| Files | Purpose |
| --- | --- |
| `web/src/features/dsa/workspace/Workspace.tsx` | Persistent editor shell, right-panel tabs, latest/historical selection, submission/discussion transitions |
| `CodeEditor.tsx`, `workspace.css` in the same directory | Monaco presentation, independent panel scrolling, responsive verdict/review/timeline design |
| `web/src/features/dsa/execution/CodeIntelligence.tsx` | Structured Results, one polling owner, AI retry, read-only source, shared persisted history |
| `use-selected-submission.ts`, `ExecutionPanel.tsx` in the same directory | Scoped historical judge loading, compact bottom results, one cancellation control per execution |
| `web/src/features/dsa/reasonai/{DSATutorPanel.tsx,contract.ts,use-dsa-tutor.ts,provider.ts}` | Preserve Tutor controls/conversation and carry the selected submission identifier |
| `web/src/lib/dsa-execution/tutor-context.ts` | Authoritative ownership/version/terminal-state checks, original source/language and bounded permitted review context |
| `web/src/lib/dsa-reports/{delivery.ts,queue.ts,repository.ts,worker.ts,contracts.ts}` | Observable retryable dispatch, discovery/claim separation and bounded exponential backoff |
| `web/src/app/api/queues/dsa-executions/route.ts` | Durable post-judge report publication without another sandbox run |
| `web/src/app/api/dsa/submissions/[submissionId]/report/route.ts` | Owned pending/expired report recovery through the existing endpoint |
| `web/supabase/migrations/20261017155808_dsa_report_delivery_recovery.sql` | Function-only date-filter and retry-delay correction; no table/row/privilege changes |
| `web/scripts/test-dsa-database.mjs` | Disposable PostgreSQL compatibility, recovery, privacy, fencing, quotas and outcome coverage |
| `web/e2e/dsa-results-studio.spec.ts`, `dsa-report-browser.spec.ts` | Results lifecycle, history, race isolation, retry, discussion, cancellation and mobile layout fixtures |
| `web/e2e/dsa-execution-unit.spec.ts`, `dsa-report-unit.spec.ts` | Authorized/bounded Tutor context and mocked report delivery/provider behavior |
| `web/e2e/dsa-execution-browser.spec.ts`, `dsa-python-real.spec.ts` | Preserve independent local Run, submission cancellation and accurate current copy |
| `web/playwright.studio.config.ts` | Focused DSA browser suite; login route readiness avoids unrelated marketing compilation |
| `web/src/lib/reasonai/server/persistence/request-context.ts` | Keep only the development E2E repository consistent across route bundles/HMR; production Supabase adapters and auth remain unchanged |
| `artifacts/dsa-v3-migration-reconciliation.json` | All 65 production migration versions and normalized SQL hashes matched with Git |
| `artifacts/dsa-results-studio-{desktop,mobile}.png` | Actual local browser screenshots using controlled fixture data |

Focused implementation commits:

- `515a4e0`: admitted-report recovery, retryable publication and persisted backoff.
- `d979fd4`: actual Supabase migration timestamp and complete ledger reconciliation.
- `f7dbc61`: Results Studio, historical context, Monaco presentation and browser tests.
- `a3bcf11`: authoritative submitted language and terminal judge-state validation.
- `2bc82a1`: development conversation fixture consistency and omission of unavailable judge counts.

The migration was applied once as Supabase version `20261017155808`; the CLI-created
proposal was renamed to that actual version. All 65 active migration files match
production SQL after newline/boundary normalization. No history entry was edited
and no installed migration was replayed. Before/after checks retained 11 execution
jobs, four completed reports and the same completed-document SHA-256:
`0c2ed17ef78854a08dc95106132a4ffb8fed11b05d242756fa2542e3e465b780`.
The function remains unavailable to anonymous/authenticated raw RPC callers.
Pre-existing unrelated Supabase advisor findings were not broadened into this work.

## D. Verification

Commands ran from `web` with Node 22. The cached executable used was
`.next/cache/npm-contree/_npx/52027bd8fc0022aa/node_modules/node/bin/node.exe`.
Provider opt-ins were disabled (`DSA_LIVE_SANDBOX=0`, `DSA_LIVE_TUTOR=0`,
`DSA_V3_LIVE_COMPONENT=0`, empty `DSA_EXECUTION_TEST_API_URL`), and tracing was off.
Browser providers and authenticated endpoints were intercepted with explicit
fixtures. The local Python browser cases used actual Pyodide/WASM and a pinned
offline asset mirror; no Nebius sandbox or Nemotron verification request was made.

Core command arguments:

```powershell
& $Node22 node_modules/typescript/bin/tsc --noEmit
& $Node22 node_modules/eslint/bin/eslint.js src/features/dsa/execution/CodeIntelligence.tsx src/features/dsa/execution/use-selected-submission.ts src/features/dsa/execution/ExecutionPanel.tsx src/features/dsa/workspace/Workspace.tsx src/features/dsa/workspace/CodeEditor.tsx src/features/dsa/reasonai/DSATutorPanel.tsx src/lib/dsa-execution/tutor-context.ts e2e/dsa-results-studio.spec.ts e2e/dsa-report-browser.spec.ts e2e/dsa-execution-browser.spec.ts e2e/dsa-python-real.spec.ts e2e/dsa-execution-unit.spec.ts playwright.studio.config.ts
& $Node22 node_modules/eslint/bin/eslint.js src/lib/dsa-execution/tutor-context.ts src/features/dsa/reasonai/contract.ts e2e/dsa-execution-unit.spec.ts
& $Node22 scripts/test-dsa-database.mjs
& $Node22 node_modules/@playwright/test/cli.js test --config=playwright.execution.config.ts
& $Node22 node_modules/@playwright/test/cli.js test --config=playwright.execution.config.ts e2e/dsa-execution-unit.spec.ts e2e/dsa-report-unit.spec.ts
& $Node22 node_modules/@playwright/test/cli.js test --config=playwright.studio.config.ts e2e/dsa-results-studio.spec.ts e2e/dsa-report-browser.spec.ts --project=chromium --workers=1 --reporter=line
& $Node22 node_modules/@playwright/test/cli.js test --config=playwright.studio.config.ts e2e/dsa-execution-browser.spec.ts e2e/dsa-workspace.spec.ts e2e/dsa-navigation.spec.ts e2e/dsa-python-real.spec.ts --project=chromium --workers=2 --reporter=line
& $Node22 node_modules/@playwright/test/cli.js test --config=playwright.studio.config.ts --project=chromium --workers=2 --reporter=line
npm run build
```

Detailed final checks are recorded in `artifacts/dsa-results-studio-verification.json`;
deployment evidence is recorded in the accompanying release response. Earlier failures were not treated as
passes: default server readiness timed out on the marketing entry, a webpack
fallback found a pre-existing unrelated landing CSS-module selector error, two
legacy text expectations needed updating to current-main copy, and the panel move
initially exposed duplicate legacy cancellation controls. The focused login/DSA
Turbopack harness and targeted reruns resolved the relevant checks. The final
production build uses the project's existing Turbopack configuration.

Final complete focused browser suite: **63/63 passed** in 2.9 minutes. The earlier
conversation 404 checks identified per-module development fixture state; sharing
that fixture across dev route bundles fixed both tests without changing production
storage. The final run also verifies omitted partial judge counts instead of
inventing a zero measurement. Final focused unit suite: **21/21 passed**. The
initial wider unit run passed 33 checks with six explicitly gated live/integration
skips. Standalone TypeScript, targeted ESLint and the disposable database suite
passed. The final Node 22 `npm run build` at source commit `2bc82a1` also passed
with exit code 0, including prebuild asset/harness integrity, production compilation,
TypeScript and page generation. Final deployment metadata is reported at release.

The disposable DB suite covers official/provisional separation, owner isolation,
hidden-data redaction, old queued work after attempt 42, atomic claims, expired
leases, stale-worker fencing, persisted 240-second backoff, idempotent manual retry,
immutable completed reports, all eligible judge outcomes, infrastructure-failure
exclusion, unchanged daily quota 10 and global concurrency 2.

## E. Manual acceptance checklist

Use your normal account on `https://www.reasonai.tech`. Start from `/dsa`, choose
3Sum, and use its displayed current function/input contract. These actions are
manual production verification and can consume your normal sandbox/AI allowance.

| # | Actions | Expected behavior |
| --- | --- | --- |
| 1 | Enter a known-correct solution. Click **Submit** without clicking Run. | Right Results opens; source is saved and a real sandbox job starts. |
| 2 | Submit an incorrect solution, for example `def solve(payload): return None` for the list-returning 3Sum contract. | The actual failing judge verdict stays visible; AI review remains eligible. |
| 3 | While judging, edit the Monaco draft, then wait for completion. | Processing status becomes the saved verdict; only actual available metrics appear. Draft editing remains usable. |
| 4 | Keep Results open after the verdict. | Actual queued/generating status becomes the persisted structured review automatically. Judge result stays visible. |
| 5 | Open an existing failed AI report you own, then click **Retry AI Review** rapidly twice. If none exists, use a controlled staging provider-failure fixture for this case. | One owned retry workflow; same sandbox submission and judge verdict; no additional sandbox run. Do not disable production credentials to manufacture an outage. |
| 6 | Enter a recognisable unsent draft. Open **History**, select an older attempt, and expand **Submitted source · read only**. | Saved verdict, report and original source belong to that selected ID; Monaco still has the unsent draft. |
| 7 | Click **Discuss with ReasonAI** on that historical review, then ask a follow-up. | Tutor opens within the current conversation; context banner identifies the selected submission. Discussion uses its original source/language and saved evidence. |
| 8 | Return to Results and choose **View latest submission**; change workspace layouts; use Ctrl/Cmd+Enter for Run and Ctrl/Cmd+Shift+Enter for Submit. | Correct latest result context; draft and shortcuts remain functional. Explicit current-editor review clears the historical discussion context. |
| 9 | Resize to a narrow browser (about 390px wide), open **AI Tutor**, select Results/History, and scroll the pane. | Cards, read-only code and actions remain reachable; no horizontal page overflow. Code remains available through the Code panel. |
| 10 | Reload a saved-submission URL, reopen History and the review, then use browser Back/Forward between attempts. | Durable results/reports persist; the selected URL/result stays consistent; the editor draft is retained. Pending reports resume status checks. |

Also reopen the older queued report under its owning account and check its saved
status: the cutoff no longer excludes its dispatch or claim. A provider outage or
daily quota can still prevent immediate completion; the UI must state that accurately.

## F. Production and freeze status

Target: Vercel project `recallstack`, team `team_szqDsSWF8Y7Yu6wdpQTRhmHo`, Git branch
`main`, domains `www.reasonai.tech` and `reasonai.tech`. The final main SHA and
deployment READY/alias metadata are verified after integration and reported with
this handoff. GitHub CI is not a release gate, as requested.

Production functional acceptance remains assigned to you. No new paid production
journey is claimed, and code freeze remains pending your completion of the checklist.
