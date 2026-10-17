# DSA V3 integration and release evidence

The user authorized production reconciliation and a distinct provisional Submit
path on 2026-10-17. This supersedes the earlier handoff's instruction to wait for
a separate database owner. No independent 375-problem oracle batch was rerun.

## Database reconciliation

The original proposals were reviewed against live columns, constraints, grants,
functions and migration history, then exercised in disposable PostgreSQL before
application. Supabase assigned these actual migration versions:

| Original proposal | Installed version |
|---|---|
| `20261016144501` explorer projection | `20261017060223` |
| `20261016144502` report orchestration | `20261017060229` |
| `20261016144503` versioned contracts/certification | `20261017060241` |

Provisional grading (`20261017060319`), the validated registry
(`20261017060427`), report activation boundary (`20261017061057`) and the
concurrent main workstream's retry-ceiling removal (`20261017083528`) follow.
Files use actual production versions. All 62 production SQL entries match their
local files after line-ending/boundary-whitespace normalization; see
`artifacts/dsa-v3-migration-reconciliation.json`. The 31 previously missing
historical migrations were recovered without reapplying them. Five older source
proposals were moved outside the CLI migration directory to avoid duplicate
application. Their static tests still inspect the preserved originals.

## Learner access and judging

Production SQL and the actual TypeScript repository independently returned Run
and Submit for 375/375 current published problems. Ten retain existing official
certificates; 365 use provisional grading. Exactly 10 certificates and zero new
V3 certification records remain. No statements, fixtures, review statuses,
certifications, learner progress or existing submissions were overwritten.

All 375 published interfaces explicitly name `solve(payload)`. Their private
references were AST-parsed and compiled to verify one JSON parameter; source
digests match the current database. No reference code appears in the seed or
learner responses. Registry entries bind the current interface, reference,
complete fixture digest, deployed harness and existing latest passing oracle and
integrity check IDs. A changed suite, source, interface, fixture, revoked entry,
or newer failed evidence invalidates admission. Pending fixtures remain pending.

The original official evaluation function and certification trigger remain
intact. Provisional plans have their own identifier and no certificate ID.
The database also prevents a provisional job from persisting an `accepted`
verdict: successful provisional work becomes `provisional_pass`. Failed
provisional submissions retain their grading-level label. Results, history and
AI evidence distinguish the two paths; neither AI nor provisional grading
awards mastery. Hidden inputs, expectations, outputs and logs remain private.

The fixed checker registry now validates alternate knight tours, left-to-right
modulo-101 expressions, zigzag multisets and nonadjacent character arrangements.
BST deletion follows its explicit deterministic inorder-successor statement.
All 126 existing expected outputs for the four semantic checkers satisfy their
new predicates; this was a checker compatibility check, not an oracle replay.

## Exact integers and reports

`tagged-v1` encodes integers outside JavaScript's safe range as bounded canonical
decimal envelopes before leaving PostgreSQL. The shared Python harness restores
actual Python integers and encodes results before either browser or sandbox JSON
transport. Comparisons preserve exact integer values and JSON types; learner
display renders the decimal value. The wire key is reserved and malformed or
forged envelopes are rejected. Both native Python and actual Pyodide checks
cover neighboring unsafe integers and nested signed outputs.

Code Intelligence uses the installed public projection and private fenced
outbox. The final integration preserves main's removal of submission-ID
allowlisting and attempt ceilings. Per-user quotas, concurrent-generation
limits, bounded provider requests, durable backoff and lease fencing remain.
`DSA_CODE_INTELLIGENCE_CREATED_AFTER=2026-10-17T06:00:00.000Z` excludes automatic
generation of the old pre-release backlog while retaining history. New reports
can be created for all published problems. Provisional and official evidence
deduplicate separately. Provider packets contain only owned source, public
statement and permitted aggregate evidence.

Report requests use Nebius's documented [schema-constrained JSON mode](https://docs.tokenfactory.nebius.com/ai-models-inference/json).
For the configured Nemotron 3 models, thinking is disabled using NVIDIA's
[documented request setting](https://docs.nvidia.com/dynamo/dev/recipes/nemotron-3-super)
so the bounded completion budget is available for the final report. Runtime
validation remains required even with constrained decoding.

## Verification status

Disposable PostgreSQL checks cover migration compatibility, owner isolation,
service-only RPC grants, idempotency, hidden-data redaction, provisional result
enforcement, report persistence/deduplication, rollout filtering and stale-fixture
rejection. The browser regression passed 35 cases initially; its one new text
assertion was corrected and the actual large-integer Pyodide case passed on
rerun. The initial execution suite passed 31 tests with six explicitly gated
live/integration skips; the reconciled report/contract suite passed 13 tests.

Real authenticated production submissions, saved AI reports and deployment
evidence are recorded below. Availability checks alone are not claims that 375
solutions have executed successfully. GitHub CI was excluded as a release gate
at the user's explicit instruction; local checks and production verification
were still required.

The pre-existing Supabase advisor baseline includes 39 public tables without RLS,
unrelated mutable-search-path/definer warnings and Auth configuration findings.
This integration does not claim a globally clean security audit or change those
unrelated application contracts. The new private execution/report objects retain
RLS and deny anonymous/authenticated raw access.

## Production verification completed

PRs #20 and #36 were merged after checking their unchanged heads; superseded #8
was closed after #36. PR #37 was already merged and reviewed. PR #40 merged the
completed integration as `8c5bb5b567d66131d2e6101f5b19986b8ba1afbb`.
Vercel deployment `dpl_GmiQSArLbJZGvyRNVWG7u9h4qaSd` reached `READY` for that
exact commit and was assigned `www.reasonai.tech` and `reasonai.tech`.

A dedicated verification user signed in through normal Supabase password
authentication. Its verified session cookies exercised the actual production
workspace, and bearer-authenticated reads checked all 375 execution-capability
endpoints: **375 Run, 375 Submit**, comprising 10 official and 365 provisional
paths. The ordinary learner catalog also returned all 375 unique problems over
19 pages. Existing independent fixture verification was not replayed.

Two browser-to-provider-to-database journeys completed using real Pyodide assets
from the production CDN, without interpreter or execution API mocks:

| Journey | Public Run | Real submission | Saved Code Intelligence |
| --- | --- | --- | --- |
| 3Sum, deliberately overfitted to public examples | 9/9 passed; zero sandbox requests | `d0bedcbd-3d5b-404d-bf8a-013a5a2b3f72`, `wrong_answer`, provisional | `aedc5513-b8d6-4b03-897c-b6b677f66e06`, completed on attempt 1 |
| Catalan Number, independent exact binomial implementation | 8/8 passed, including an unsafe-in-JavaScript integer; zero sandbox requests | `1e863488-4479-4203-aa38-855c8c23b74f`, `provisional_pass` | `d1888dff-a54b-4a7c-993f-d11785937bd3`, completed on attempt 1 |

Both submissions invoked real isolated sandbox operations. Both reports used
`nvidia/nemotron-3-super-120b-a12b`; validated documents and actual token usage
were saved, and canonical public report projections matched the private stored
documents. Source SHA-256 values matched the submitted source. History, results
and report text remained available after navigation/reload. The saved report
rendered in the actual workspace, and the results region's scroll position moved
in both journeys. No official Accepted verdict or certification was granted.

Anonymous execution/report reads returned 401. Authenticated reads for another
user's execution/report returned 404. All 11 private execution/report tables have
RLS enabled and deny raw SELECT to both anonymous and authenticated roles.
There are still exactly 10 legacy certificates and zero V3 certification runs.
The production migration ledger still contains exactly the 62 reconciled Git
migrations, with no missing migration or unapplied proposal.

The local production build, TypeScript check, targeted ESLint, Python Ruff
check/format, disposable database regression and report provider checks passed.
The verification budget used exactly four new calls (two sandbox operations and
two report generations), bringing the existing combined ledger to its five-call
limit; neither report needed a provider retry. Further paid verification needs
additional budget authorization.

Machine-readable release evidence is in
[`artifacts/dsa-v3-production-verification.json`](../../artifacts/dsa-v3-production-verification.json).
Authentication credentials, private fixtures and reference implementations are
excluded from that artifact. Remaining official content review applies to the
365 provisional problems and does not prevent learner access.
