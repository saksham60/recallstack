# DSA V3 Supabase owner handoff

Project: `jlqawpdsyptfxspyqnsu`. On 2026-10-17 the user authorized this workstream
to reconcile production and enable provisional grading. The three extensions and
provisional path are now applied after live-schema inspection and disposable
PostgreSQL checks. No fixture approval, publication change or certificate insertion
was performed. Official certification remains a separate review process.
See `integration-20261017.md` for current migration versions and release evidence;
the detailed original certification handoff below remains applicable to official
certification, rather than a prerequisite for provisional learner access.

Latest web reliability delta (2026-10-17): production and Git now contain 65
matching migrations. `20261017155808_dsa_report_delivery_recovery.sql` is applied;
its date cutoff governs new-work discovery, while existing admitted reports can
recover without that cutoff. Daily report quota and global concurrency are
unchanged. See [Results Studio handoff](results-studio-handoff.md) for the verified
root cause, function-only change and manual acceptance checklist. Do not replay
installed migrations. Current learner-first admission from migration
`20261017135700` continues to allow direct Submit independently of local Run and
certification review.

Use this repository and the existing Supabase data. Additional user documents are
not a prerequisite for implementation. Keep all private schemas below unexposed
in Supabase API settings. Never expose reference solutions, oracle metadata,
hidden cases, worker tokens, outboxes or service credentials to learners.

## Original handoff baseline (superseded counts are retained as history)

- 375 current published problem versions; 375 imported private references.
- Latest suites: 10 published with existing legacy certificates; 365 need review.
- Current read-only snapshot: 11,591 fixtures, 320 verified and 11,271 pending.
  Actual fixture audit found no duplicate inputs or public/hidden overlap. Older
  provenance flags describing duplicates are historical, not current row evidence.
- Existing canonical company tables: `dsa_companies(id,canonical_name,slug,
  review_status)`, `dsa_company_aliases`, `dsa_problem_companies(definition_id,
  company_id,source_block_id,match_method,raw_alias)`, and
  `dsa_problem_company_sources(definition_id,source_block_id,review_status,
  raw_companies,source_metadata,reviewer_note)`. There are 56 canonical companies
  and 653 parsed associations. Source states are auto_exact, auto_delimited,
  auto_segmented and needs_review. Parsed associations are labelled imported,
  not falsely described as editorially reviewed.
- Existing execution objects from `20261015172042_dsa_execution_jobs.sql` must
  remain intact: private certificates/jobs, fenced slots, frozen plans, admissions,
  durable dispatch and service-only `dsa_execution_command` RPC.
- Main's owner foundation was merged into this branch from `812e700`. Installed
  explorer boards/lanes/cards, public Code Intelligence reports/skill signals and
  private certification checks/reviews remain authoritative. Do not reapply their
  historical migration files. The three proposals below extend those objects.
- Latest SELECT-only oracle evidence snapshot: 370 current suites have a latest
  passing independent output-oracle check; 340 recorded digests match current
  fixture digests. Others need digest reconciliation or additional review. These
  are not typed Python, source, checker or hosted certifications. Exact IDs and
  check references are in `artifacts/dsa-v3-owner-oracle-evidence.json` and the
  certification manifest. The owner's work may continue after this snapshot.
- `artifacts/dsa-v3-catalog-inventory.json` and
  `artifacts/dsa-certification-manifest.json` identify every exact version/suite.
  One suite pointer changed between read-only snapshots; the inventory records its
  earlier pointer. Recheck current pointers before applying any data work.

## Installed extensions (do not reapply)

| Order | Proposed migration | Purpose |
|---|---|---|
| 1 | `20261017060223_dsa_v3_explorer_projection.sql` | Originally proposed as 20261016144501; owner layouts and safe company projection |
| 2 | `20261017060229_dsa_v3_report_orchestration.sql` | Originally 20261016144502; report outbox, claims, telemetry and owned projections |
| 3 | `20261017060241_dsa_v3_versioned_contracts_certification.sql` | Originally 20261016144503; official typed registry and certification ledger |

All files are under `web/supabase/migrations/`, generated using the existing CLI
convention and renamed to their actual Supabase application timestamps. Compare
installed history before any future change. These contain no certification data
seeds or blanket approvals.

These replace the unshipped proposals timestamped 084605, 100348 and 133229.
**Use the actual installed versions above.** No competing company table or
personal-board storage table is created. If an earlier proposal was applied by
another workstream, reconcile it through an explicit owner-reviewed follow-up;
do not blindly apply this sequence or rerun an installed migration identifier.

## 1. Boards and company projection

`public.dsa_personal_boards` is a SECURITY INVOKER compatibility **view** over the
installed `dsa_explorer_boards`, using additive `v3_category_id`/`v3_layout`
columns and a unique owner/category index. It projects the existing board revision
as `row_version`; original settings, lanes, cards and board IDs remain intact.
Owner RLS protects reads. An INSTEAD OF trigger with explicit authenticated-owner
checks handles writes and rejects identity/revision changes. Web PUT uses
compare-and-swap, returns 409 on conflicts, and rolls back optimistic UI.

`dsa_v3_private.visible_version(uuid)` is a narrow boolean SECURITY DEFINER helper
with empty search path. It verifies current published DSA version, active domain,
publication pointer and the existing quality publication gate. Raw version JSON
is never granted to learners. Keep `dsa_v3_private` outside exposed schemas.

`public.dsa_v3_board_companies(uuid[],integer)` returns only
`problem_version_id,slug,name,review_status`. It requires real auth, bounds requests
to 1,000 exact version IDs and 500-row pages, and reuses installed associations.
Canonical companies must be approved. Sources in needs_review are excluded;
recognized automatic parse states are marked imported. Existing source columns,
aliases and reviewer notes are not exposed. No company data is fabricated or
overwritten. Missing migration storage produces a visible recoverable UI state.

## 2. Reports, history and limits

Private schema `dsa_reports_private` adds orchestration events, deduplication,
submission links and attempt telemetry around canonical
`public.dsa_code_intelligence_reports`. Dispatch reconciles already committed
terminal judged jobs into idempotent events in a **separate transaction**. There
is no trigger on judge finalization. Report storage failures cannot roll back a
verdict. Infrastructure failures, cancelled work and local Run do not schedule AI.

An existing compatible ungenerated public report is adopted with its original ID.
Otherwise a new version is inserted without replacing old reports or skill signals.
Each private control row references that public report ID; its validated state and
assessment are projected back atomically. The original job-snapshot trigger keeps
judge facts authoritative. The proposal revokes service execution of the old
unfenced `dsa_code_intelligence_enqueue`/`claim` functions so two worker paths cannot
race. Their definitions are retained for an owner-reviewed rollback.

Reports deduplicate on `(user_id,problem_version_id,code_sha256,verdict,model,
rubric)`. Each submission links to its report. Generation reads the original
durable code, never a caller-supplied report body. Model/rubric changes require
deliberate operator regeneration; repeated GET, refresh and identical submissions
reuse the durable result.

`dsa_report_command` is service-role only, SECURITY INVOKER with empty search path.
Actions: history, get, dispatch, claim, finish and operator-only regenerate.
Learners/anon have no private schema usage, table access or RPC execution. The
existing public report/skill read-own policies remain intact. The web server
supplies userId exclusively from verified Supabase auth, enforces same origin and
returns no-store responses. History pages contain 20 items with a stable timestamp
and UUID cursor. Owned report reads include a read-only copy of that submission's
source and SHA; history lists never contain source or plans.

Limits: 10 new reports/user/UTC day; 2 global concurrent generations; at most 2
provider attempts/report; 90-second fenced worker lease; 30-second provider
timeout; durable 30-second retry backoff; 40,000-byte evidence packet;
2,400 output tokens; bounded response and strictly validated structured document.
Rate-limited reports stay visibly unavailable until operator review. Attempt rows
record available actual usage, duration and safe errors. Unknown USD cost is null,
not an invented estimate. Infra failures do not masquerade as algorithmic failure.

AI sees only original user source, bounded public statement, allowed aggregate
judge metrics and three earlier verdicts. No hidden inputs, expectations, oracle,
plan, stdout or stderr enters its packet. Complexity/learning suggestions are AI
estimates; they cannot overwrite the judge or award mastery. Saved report versions
provide history; any future skill aggregation must preserve existing mastery rules.

Runtime reuses existing ReasonAI/Nebius transport and Vercel Queue. Consumer topic
`dsa-code-intelligence` is registered in `web/vercel.json`. Completion, owned report
reads and the authenticated recovery sweep dispatch the durable outbox. The flag
`DSA_CODE_INTELLIGENCE_ENABLED` defaults to `0`; it has not been enabled live.
Vercel project `recallstack` has the feature flag configured in Production,
Preview and Development. The `DSA_CODE_INTELLIGENCE_MAX_ATTEMPTS` environment
setting was retired. Report generation no longer has a fixed attempt ceiling;
only transient errors are retried, respecting the queue lease/backoff and
concurrency protections. Previously failed reports are not automatically
requeued; an operator must explicitly request a fresh analysis.
Environment edits take effect on a subsequent deployment, not an existing one.
Keep generation disabled until schema/application compatibility is verified.
Submission-ID allowlisting was removed after the initial pilot. Report creation now applies to all eligible judged submissions when generation is enabled, with per-user quotas and bounded concurrency preserved. Historical pending events remain intact.

## 3. Typed contracts and exact certification ledger

`dsa_execution_private.v3_contracts` stores exact-version Python metadata with
draft/approved/revoked state, source hash/URL, reviewer/time/evidence and an optional
learner-facing source notice. Approval is separate from suite certification.
`dsa_v3_problem_contract(problem,version)` exposes only approved published-version
contracts, revisions and source notices to authenticated users, including older
published links. Trusted Submit eligibility still requires the current version.
This enables meaningful
typed starters and provisional examples while the hidden suite is still pending.

The canonical adapter/checker/template schemas are in
`web/src/lib/dsa-execution/python-contract.ts`; invocation source is
`python/runner_harness.py`. Registry entries must specify the real function/method,
parameters, codecs, return/mutation selection or design method registry. Do not
infer signatures solely from titles. Runtime profile is currently fixed: Python,
24,000 source characters, 65,536 fixture-input bytes, 100 cases, 3 seconds/case;
local init 60 seconds/run 120 seconds; Nebius supervisor 22 seconds/operation
25 seconds. Do not approve contracts that exceed the supported profile.

`v3_certification_runs` records exact problem/version/suite, JSONB contract hash,
complete fixture hash, harness SHA, checker/template versions, manifest hash,
16 required checks, bounded evidence and reviewer/time. Typed certificates link
to an approved run. Their approved registry contract must match exactly; changed
fixtures or revoked approval invalidate both Run and Submit. The app also requires
the approved harness SHA to equal the deployed generated source. Existing legacy
certificates retain compatibility and are not relabelled V3-certified.
The installed `check_certification_gate` and its eight named certification checks
remain intact. The V3 ledger supplements that gate; approval must satisfy both.
Existing owner output-oracle checks can be referenced as evidence after confirming
their exact suite/digest, rather than discarded or relabelled as hosted proof.

Use `dsa_execution_private.v3_fixture_sha(suite)` for the database fixture digest.
Contract digest is `encode(sha256(convert_to(contract::text,'UTF8')),'hex')` in
Postgres. Do not substitute a JavaScript JSON hash: JSONB serialization differs.
The complete digest covers IDs, input, expectation, visibility, validation and
fixture references. It must be captured after the final reviewed fixture state.

Required checks: statement, source, adapter, starter, publicFixtures,
hiddenFixtures, independentOracle, checker, duplicateAudit, overlapAudit,
boundaryCoverage, stressCoverage, realPython, judgeVerdicts,
sandboxCompatibility and certificateEligibility. An approved row cannot omit
these checks or reviewer/evidence. Populate them only from actual supporting
artifacts. No tool in this branch updates publication or certification flags.

The replacement evaluation plan preserves legacy behavior, extends complete public
Run plans to 100 cases and adds only fixed checker mappings: exact_json/exact,
unordered_json/unordered, numeric or numeric_json/numeric_tolerance, and the
approved unordered_triplets/two_sum_indices/topological_order predicates/custom.
Arbitrary checker code is never executed. Counts/log visibility policy is retained.

## Canonical 3Sum: exact work remaining for official certification

- Problem `6bf047e9-6735-4892-b063-f59e4c8ce29f`;
  version `62b831b6-4c58-438e-9442-a78be83e3469`;
  latest suite `c34f14dd-3de2-4199-bf8f-67d0db67f9fb`.
- Existing 36-fixture pilot: 9 public, 27 hidden, currently pending/needs_review.
  Both independent local algorithms matched all 36; two additional 3,000-element
  stress checks passed. A restricted-domain solution passes all 9 public fixtures
  and fails an actual hidden fixture. Inputs/answers remain private.
- `artifacts/dsa-v3-three-sum-local.json` records automated proof and a candidate
  typed `three_sum(values: List[int]) -> List[List[int]]` mapping. It uses exact
  comparison to preserve the currently published lexicographic requirement.
- Source review found a material variant: current ReasonAI statement requires
  lexicographic output and allows short arrays; linked LeetCode permits arbitrary
  ordering and constrains length to at least 3. Approve this clearly attributed
  authored variant with a public source notice, or publish a reviewed corrected
  version. Do not silently change an existing version's semantics or identifiers.
- Real Nebius component proof: operation
  `01a144ed-017b-73f2-b33b-2b648c0ae1b6`; all 36 cases matched; measured Python
  2,156 ms, peak child memory 18,180 KiB, total component elapsed 6,030 ms.
  Exact source/harness hashes are in `artifacts/dsa-v3-live-component.json`.
  This is component compatibility, not a persisted submission or release E2E.
- Owner: review source/contract/oracles and current pointers; apply schema in
  staging; install the approved typed registry and reviewed final fixture states;
  record genuine evidence/digests; link a certificate only after all checks pass.
  Fixture approval and certificate insertion are deliberately not automated here.

## Integration and release return contract

Return installed migration versions, environment, unchanged canonical IDs, approved
contract/ledger/certificate IDs, exact digests, reviewer evidence, advisor results
and authorization test results. Then run authenticated browser positive and
public-pass/hidden-fail journeys through existing `/api/dsa/executions`, Queue,
ConTree, durable result and Code Intelligence, followed by refresh/history checks.

The combined live execution/AI budget is five including retries: **1 used, 4
remaining** in `artifacts/dsa-v3-live-budget.json`. Reserve two genuine submission
operations and two AI generations for those journeys. Do not run broad live
catalog batches or automatic retries outside the remaining budget. Local fixture,
browser, database and read-only audit operations do not spend that budget.

Before release verify: anon/foreign access denial; no raw private-column grants;
CAS conflicts; registry draft/revoked denial; certificate/fixture/hash revocation;
queue duplicate and outage recovery; report fencing/quota/backoff; private fixture
absence from HTTP responses, logs and public artifacts; and no mastery changes.
The user's subsequent integration instruction authorized the production
applications recorded in `integration-20261017.md`. Official certification still
requires the evidence and independent review described here.
