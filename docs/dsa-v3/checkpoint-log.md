# DSA V3 checkpoint log

## 2026-10-16 — started

- Branch: codex/dsa-v3. Baseline: 11e6a7a.
- User authorized implementation after review. Desktop web only; no mobile edits.
- Supabase owner will supply handoff; reviewed content/metadata also pending.
- Max five combined paid Nebius/AI verification calls, retries included; used 0.
- Preserve existing mastery semantics independently of Accepted.
- Checkpoint 1 in progress: inventory, canonical routes, topic home/boards,
  personal layouts contract, legacy migration and browser regression.
- Checkpoints 2–4 pending. Do not label 375/375 or production-ready without evidence.

## Checkpoint 1 — implementation and local verification

- Topic-first dashboard with canonical counts/progress, topic search and local
  account/version-scoped resume link; three-lane boards, composable filters,
  pointer/keyboard ordering, collections, optimistic saves and conflict rollback.
- Canonical workspace, server-resolved legacy links, UUID/category mappings,
  source attribution, practice tracking, notes, bookmarks, tutor and drafts retained.
- Proposed migration and exact API handoff prepared. Production board/company
  persistence integration remains pending the separate owner's review/application.
- Backend: Ruff and mypy passed; 42 API + 14 PostgreSQL integration tests passed.
- Existing execution lifecycle/judge/context unit checks: 15 passed (no provider).
- Full browser regression: 180 passed, one existing opt-in real API check skipped.
  Fixtures test UI/contracts, not real production Supabase persistence or grading.
- Desktop screenshots inspected and copied to ignored local directory
  `web/.next/cache/dsa-v3-checkpoint-1/`; narrow-browser/overflow checks passed.
- Initial cold dev compile/resource contention and missing manual realtime test
  configuration were corrected before the clean full browser run. Old screen
  tests were migrated to canonical equivalents rather than disabled.
- Production read-only inventory saved for all 375 IDs; existing certificates 10,
  suites needing review 365. Canonical 3Sum is published but uncertified.
- Production build passed with TypeScript and route generation. No production
  migration/deployment. Paid calls 0/5.

## Checkpoint 2 — shared runner verified locally; integration still open

- One authoritative Python harness is packaged byte-identically into browser and
  Nebius supervisor; SHA parity is enforced before execution checks and verify.
- Versioned typed function/method, mutation, design-class, tree/list/graph and
  identity adapters; a fixed public/trusted comparator registry replaces the
  incompatible solve(payload)/JSON-only browser behavior.
- Certified public bundle comes from the service-only evaluation plan, filtered
  to public cases; no hidden fixture or oracle is sent to the browser worker.
- Fresh Pyodide interpreter per test; separate initialization/case/run budgets,
  cancellation, bounded output, source-line diagnostics and exact-code receipt.
  Custom/provisional runs cannot unlock Submit. Historical practice receipts stay
  readable; the provisional practice Submit action was removed from the workspace.
- Actual pinned Pyodide/WASM/Worker: 24 browser tests passed with a controlled
  mirror of the exact npm runtime artifact. They cover all 24 requested scenarios,
  including local 3Sum edge cases, structured adapters, cancellation, worker
  recovery, download failure, warm execution and first-party fetch CSP denial.
  API data in these tests is fixture data; this is not production 3Sum evidence.
- UI execution regression: 7 passed. One initial selector encoding typo was fixed
  and that entire suite rerun. CPython harness: 20 passed. Contract/comparator,
  supervisor compilation and existing lifecycle/context unit checks: 20 passed.
- Live Nebius/AI calls remain 0/5. Code Intelligence persistence/lifecycle and
  real canonical 3Sum positive/hidden-failure proof are still pending. Do not mark
  this checkpoint complete or deploy the work as a certified 375-problem release.

## Checkpoint 2 — report lifecycle implemented; live boundary still pending

- Private terminal-event outbox, versioned report deduplication, two global slots,
  two bounded attempts, 10-report daily user quota, fenced leases and token/latency
  telemetry prepared as an additive owner-reviewed migration. It has only been
  applied to disposable local Postgres. No live environment flag was enabled.
- Existing ReasonAI transport and Vercel Queue reused. Evidence excludes hidden
  cases/oracles/logs. Strict structured reports cannot update judge verdicts.
- Owned paginated history and persisted report surface distinguish Verified by
  Judge, Estimated by AI and Not Yet Available, with loading/failure/retry states.
- Local report SQL: 5 integration tests passed; worker/provider transport: 3 unit
  tests passed with injected transport; browser report/history/auth: 2 passed with
  fixture analysis. No real AI generation or production persistence is claimed.
- The actual canonical 3Sum suite remains uncertified. Source/reference metadata,
  owner application and the constrained live proof are outstanding. Paid calls 0/5.

## Latest reconciliation and release gates (2026-10-16)

This entry supersedes earlier 0/5 and metadata-waiting status above. Existing
repository and Supabase data are authoritative; no additional document is needed.

- Paid calls: **1/5 used**, 4 reserved for two genuine submissions and two reports.
  Actual canonical 3Sum local oracles matched 36 fixtures, including a genuine
  public-pass/hidden-fail candidate; one real Nebius operation passed all 36.
  Saved hashes bind source, fixture snapshot and shared harness. This is component
  evidence, not a persisted submission/report release proof.
- Implemented shared runtime, exact Run receipt, approved typed registry,
  certification ledger, bounded report worker/history/read-only submitted source,
  and deterministic offline certification CLI with resume and privacy checks.
- Merged main through 812e700 and retained the separate owner's installed
  foundation/data work. Board compatibility now extends dsa_explorer_boards rather
  than creating another storage table. Report orchestration adopts/versions
  existing dsa_code_intelligence_reports and projects validated assessments there.
  Reconciliation runs after committed judge results; no judge-finalization trigger.
- Superseded the unshipped 084605/100348/133229 proposals with
  20261016144501/144502/144503. No owner-applied SQL was rewritten or reapplied.
  Existing eight-check certificate gate remains in force alongside the new ledger.
- SELECT-only current owner oracle snapshot: 370 latest passed checks, 340 with
  matching current digests. The manifest preserves them separately from missing
  typed/source/checker/hosted proofs. All 375 audited; 0 V3-certified, 375 blocked.
- Vercel report flags configured across Production/Preview/Development: enabled=0,
  maxAttempts=1, submission scope=all-zero UUID. Local secrets/config preserved.
  Keep the two exact pilot IDs scoped before enabling any live generation.
- Full browser: 206 passed, 1 opt-in live skip; actual Pyodide matrix 25 passed.
  State/provider contracts: 518 passed. DSA unit/CLI/report: 29 passed. Reconciled
  storage: 9 passed. TypeScript, lint, production build, Ruff and mypy passed.
  Full backend clean rerun and final release metadata are in verification.md.
- Next/security dependency updates remove known runtime vulnerabilities. Five
  development ESLint-chain advisories remain; no forced framework downgrade.
- No mobile changes, production DB mutation, V3 deployment or 375/375 claim.
  Owner application/approval and authenticated Submit/report proof remain gates.

## Final local checks and review package

- Final clean full backend: **319 passed**, with all integration tests enabled
  against a newly created loopback-only disposable database. The database was
  removed after the run. Reconciled report adoption/projection and all DSA tests
  are included. The logging test-order issue is fixed without weakening assertions.
- Final frontend: 206 browser passed/1 explicit opt-in skip; 518 state/provider
  passed; 29 DSA unit/CLI passed; disabled-feature browser 1 passed; TypeScript,
  ESLint, Next production build, source parity, Ruff/formatting and mypy passed.
- Application/reconciliation commit: 26fc1f12b22473d9163a1698742c1e10edb30817.
  Later packaging commits contain documentation/manifest metadata only.
- Release remains unapproved by evidence, not awaiting an additional user content
  document. See release-report.md for the concrete owner and hosted proof gates.
