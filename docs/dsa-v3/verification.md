# DSA V3 verification

Verified locally on 2026-10-16. Production release is **not complete**. Database
application belongs to the separate owner; no production migration or content
approval was performed by this web workstream. One of five combined paid calls
was used for the genuine 3Sum Nebius component test; four remain.

| Boundary | Actual evidence | Limit |
|---|---|---|
| Canonical browser flows and existing functionality | 206 passed, 1 existing opt-in live check skipped | Full browser regression uses API fixtures/loopback providers |
| Actual Pyodide/WASM/Worker | 25 tests within that browser run passed | Real interpreter and CSP; fixture public API data |
| State, tutor/provider transport, conversations and diagrams | 518 passed; feature-disabled browser 1 passed | Injected transports; no paid generation |
| Execution, contract, reports and certification CLI | 29 passed | Includes actual offline Python CLI execution/resume; no paid provider |
| Reconciled boards/reports storage | 9 PostgreSQL tests passed | Exact installed base definitions plus pending proposals in disposable DB |
| Full backend | 319 passed, including PostgreSQL integration and CPython harness checks | Fresh disposable PostgreSQL, not production |
| Static checks | TypeScript, ESLint, Ruff, formatting and mypy passed | No deployment claim |
| Production compilation | Next.js 16.3.8 build passed after owner merge | Build success does not prove hosted runtime |
| Shared Python bytes | Browser/server source SHA parity passed | SHA 3e96d81f62c21bc4c51aa38c25a2b6d1ed7d7eb48aa1bf600f7e4c3b2286362a |
| Runtime dependency audit | Zero known runtime vulnerabilities | Five high dev-only ESLint-chain findings remain |
| Actual catalog audit | All 375 identities and 11,591 fixtures audited; zero duplicate inputs/public-hidden overlap | Publication/legacy certificate flags are not V3 certification |
| Separate owner's oracle evidence | 370 latest passing output-oracle checks, 340 with matching current digests | Timestamped SELECT-only snapshot; typed/hosted approvals are separate |
| Canonical 3Sum independent validation | Both local oracles matched all 36 actual cases; public-pass/hidden-fail candidate; two 3,000-element stress checks | Source variant requires approval; private data stays ignored |
| Real Nebius compatibility | Operation 01a144ed-017b-73f2-b33b-2b648c0ae1b6, all 36 cases matched | Component proof; no persisted submission/report or authenticated hosted journey |

The full browser run initially had five failures: two cold-route timeouts, a
3Sum test-wide timeout, an obsolete uncertified-Submit expectation and an
ambiguous saved-note locator. Those were corrected/rerun, then the complete
207-test run passed with the one existing opt-in skip. A later screenshot pass
had one route-load timeout; its isolated rerun passed. These failures were not
silently skipped. Screenshots use labelled fixtures and are not production proof.

The first full backend run found a pre-existing test-order logging issue:
Alembic fileConfig disabled application loggers. Preserving existing loggers
fixed the isolated knowledge cleanup test. A subsequent run reused persistent
integration seed data and found one report-adoption ordering issue. Report reuse
now adopts an existing compatible canonical row independently of processing
order. Storage checks passed again; the final full run used a fresh database and passed all 319 tests.

Production gates remain: owner review/application of the three 144501/144502/
144503 proposals, per-version typed/source/checker/fixture approvals, linked
certification ledger, backend rollout, real authenticated correct and
public-pass/hidden-fail submissions with durable reports, then hosted browser
verification. Current V3 certification is 0/375. All exact blocked IDs are in
artifacts/dsa-certification-manifest.failures.json.

The owner's production status document reports 39 pre-existing public tables
without RLS. That separate application-specific security review remains open;
no blanket remediation was applied. New scoped storage was checked locally.

Vercel recallstack Production/Preview/Development and local ignored config have
report generation disabled, maxAttempts=1 and an all-zero submission allowlist.
Replace the allowlist with the two actual pilot IDs before limited live testing;
never enable an unrestricted historical backlog within the remaining budget.
Environment edits require a subsequent deployment. No V3 deployment was created.
