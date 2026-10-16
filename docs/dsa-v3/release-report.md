# DSA V3 implementation and release report

Status: implemented and verified locally; **not a completed production release**.
Application/reconciliation commit: `26fc1f12b22473d9163a1698742c1e10edb30817`.
Integrated owner main baseline: `812e700`. Later packaging changes are metadata.
Draft PR: [#34](https://github.com/saksham60/recallstack/pull/34), branch
`codex/dsa-v3`. Remote CI and the automatic Vercel preview are separate checks.
No V3 production deployment ID or persisted 3Sum submission/report ID exists.
The branch push starts an automatic preview build; that is not a production rollout.

| Deliverable | Review artifact |
|---|---|
| A. Files created/modified/removed and retained behavior | `artifacts/dsa-v3-implementation-manifest.json`, `legacy-cleanup-manifest.md` |
| B. Canonical architecture | `architecture.md`, `api-contracts.md`, `python-execution.md` |
| C. Tests and limits | `verification.md` |
| D. 3Sum actual evidence | `artifacts/dsa-v3-three-sum-local.json`, `artifacts/dsa-v3-live-component.json`, `artifacts/dsa-v3-live-budget.json` |
| E. All 375 exact identities and blockers | `artifacts/dsa-certification-manifest.json`, companion `.failures.json`, `certification.md` |
| F. Applied baseline versus pending owner changes | `supabase-production-status-20261016.md`, `supabase-handoff.md` |
| G. Source-control/release readiness | This report and the draft PR |
| H. Remaining issues and corrective actions | Table below and exact per-problem failure manifest |

Local checks: 319 full backend tests; 206 browser tests with one existing opt-in
live skip; 518 state/provider tests; 29 DSA execution/report/certification tests;
one feature-disabled browser test. TypeScript, ESLint, Ruff, formatting, mypy,
shared Python SHA parity and Next.js 16.3.8 production build passed. The runtime
dependency audit reports zero known vulnerabilities. Browser/API fixtures are
clearly separated from genuine provider evidence in verification.md.

The real Nebius operation `01a144ed-017b-73f2-b33b-2b648c0ae1b6` matched all 36
canonical 3Sum fixtures, using the same harness as local execution. It is component
compatibility evidence. The local negative candidate passes all nine public cases
and fails an actual hidden case. Neither is a persisted authenticated Submit or AI
report. One combined paid call is used; four remain, including all retries.

Vercel `recallstack` has generation disabled, a one-attempt report cap and an
all-zero submission allowlist in Production/Preview/Development. These are
server-only flags; existing secrets were preserved. Before the remaining live
test, install the reviewed schema, configure exactly the two pilot submission
UUIDs and deploy matching application/backend code. Keep the allowlist until
further spending is authorized. Do not drain historical queued work during this
test. A READY preview or production deployment alone cannot close the release.

| Severity / scope | Remaining work | Corrective action |
|---|---|---|
| Release gate: schema | Three unshipped V3 extensions remain owner-applied | Review/apply only 144501/144502/144503 in staging, verify RLS/projections and return installed IDs/digests before production |
| Release gate: all 375 exact problem IDs | Typed contracts, source/checker/fixture/ledger and hosted proofs incomplete | Use the per-ID failure manifest, existing imports and retained owner oracle evidence; no blanket approvals |
| Release gate: canonical 3Sum `6bf047e9-6735-4892-b063-f59e4c8ce29f` / version `62b831b6-4c58-438e-9442-a78be83e3469` | Authored source variant and pending suite `c34f14dd-3de2-4199-bf8f-67d0db67f9fb` | Approve the attributed lexicographic/short-array variant or publish a corrected version without overwriting old semantics; complete exact certification |
| Release gate: hosted integration | Correct and public-pass/hidden-fail real submissions plus reports absent | Reserve the remaining four operations, record actual job/operation/report IDs, refresh/history and privacy evidence |
| Release gate: deployment | Backend route additions and V3 frontend not rolled out | Deploy compatible backend before web, then verify real authenticated browser to durable data and response |
| Existing critical security finding | Owner reports 39 legacy public tables without RLS | Separate application-specific policy review and staged rollout; do not apply a blanket change that breaks backend contracts |
| Non-runtime dependency finding | Five high ESLint-chain advisories | Track patched upstream tooling; do not force an unrelated framework downgrade |

Current V3 certification is **0/375**. The read-only owner snapshot separately
records 370 latest passing output-oracle checks, 340 with matching current digests.
Those checks are retained and referenced rather than repeated or discarded; they
do not establish typed Python or hosted judge eligibility. All 375 canonical
identities, existing legacy certificates and historical records remain intact.

No native mobile changes or production database writes were made by this web
workstream. Main merge and production rollout remain gated on the above evidence.
