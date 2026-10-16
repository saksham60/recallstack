# DSA V3 canonical architecture

The web implementation uses the existing FastAPI catalog, Supabase identity and
private execution storage, Nebius ConTree sandbox, ReasonAI provider transport and
Vercel Queue. It introduces no mobile implementation or new cloud provider.

## Navigation and learner state

`/dsa` lists topics. `/dsa/[topicSlug]` composes catalog pages, learner progress,
bookmarks and existing company associations into difficulty lanes. Personal board
arrangements use owner RLS and revision-based compare-and-swap. Imported company
associations remain labelled imported. Canonical difficulty is never rewritten.

`/dsa/problem/[slug]?version=<uuid>&submission=<uuid>` is the only workspace.
Legacy query/UUID/category/library/content links resolve into it. Explicit older
published versions remain readable; the default resolves the current version.
Current-only trusted eligibility is independent of historical read access.
Versioned drafts, notes, bookmarks, self-assessed mastery and tutor context remain
separate from official submission results. Approved typed contracts add a revision
to Python draft keys and retain legacy drafts for explicit copying.

## Contract and local execution boundary

The private exact-version contract registry publishes only approved signature,
codec, adapter and source-notice metadata. Typed invocation supports functions,
solution methods, in-place mutation, design classes and structured/identity values.
Fixed checkers handle exact/unordered/numeric results and reviewed predicates.
Arbitrary checker code is not executed.

`runner_harness.py` is the authoritative Python invocation source. Generated server
and browser exports must have byte-identical SHA-256. Pyodide runs it in a fresh
Worker/interpreter per case, with bounded initialization, execution, output and
whole-run budgets. Worker CSP prevents first-party data access. Local Run makes
zero Nebius execution requests; cancellation and navigation terminate active work.

Certified public cases are projected from the validated service-only evaluation
plan. Hidden cases and reference solutions never enter that projection. A local
Run receipt binds user, exact source, problem/version, suite, contract, public
fixtures and harness revisions. Editing code or metadata invalidates it. Examples
and custom runs cannot unlock Submit. This is a UX condition; the server makes its
own eligibility and grading decisions.

## Trusted execution boundary

`POST /api/dsa/executions` verifies identity, origin, limits, idempotency and current
publication/certificate eligibility. A typed plan additionally requires the
approved contract, linked certification ledger and exact fixture/harness hashes.
Admission freezes a private plan and source before durable outbox dispatch.

The existing execution Queue consumer claims a fenced slot, starts Nebius, and
runs the shared harness in fresh unprivileged processes. The sandbox receives
source and inputs, never expectations or checker logic. Trusted TypeScript checks
outputs and persists the official result. Poll/recovery handle unknown creates,
duplicate deliveries, provider failures and stale leases. Learner projections
contain only permitted public detail and policy-controlled aggregate metrics.

## Code Intelligence boundary

Genuine terminal judged submissions create transactional report events. A durable
report deduplicates by owner, problem version, source hash, verdict, model and
rubric. Dispatch/claims enforce daily quota, global concurrency, attempt limits,
retry backoff and fencing. The Queue payload contains only the report UUID.
An optional server-only submission allowlist scopes dispatch and claims for
limited live verification, including messages queued before the scope changed.

The existing AI transport receives original user source, public statement and
allowed aggregate judge evidence. It receives no hidden fixtures, oracle, private
plan or execution logs. Structured output is validated before storage. AI prose,
complexity and learning observations are labelled estimates and cannot modify a
verdict or mastery. Token usage and latency use actual provider telemetry; unknown
price stays null.

Owner-only history and report APIs verify Supabase identity, return no-store
responses and expose the exact historical submitted source read-only. Missing
storage, queued generation and failures have recoverable UI states. Generation
defaults off; reading saved results does not require enabling new AI calls.

## Certification and deployment boundary

The CLI audits all 375 exact identities and private imported fixtures. Reviewed
bundles execute independent references in disposable offline Chromium/Pyodide
workers; resumable manifests contain hashes/statuses rather than private values.
Only the separate owner applies migrations, reviews source/fixture changes and
records approvals linked to exact evidence. Automation does not grant eligibility.

See [supabase-handoff.md](supabase-handoff.md), [api-contracts.md](api-contracts.md),
[python-execution.md](python-execution.md) and [certification.md](certification.md).
Production release remains gated on owner application, certification and the real
authenticated submission/report journeys; a READY deployment alone is insufficient.
