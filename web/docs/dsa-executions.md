# DSA web execution — Part 2

This adds the Next.js execution API, ConTree supervisor, durable PostgreSQL job
state, Vercel Queue consumer, recovery outbox, and web Run/Submit results. It does
not publish imported specifications or certify production suites. The production
rollout flag defaults to off. The additive migration is installed in production;
the server credential is configured. Learner execution still requires independently certified content.

## API v1

Responses carry `X-DSA-Execution-Version: 1`, `Cache-Control: private, no-store`,
and authorization/cookie variance. Version 1 is the default; a supplied unsupported
`X-DSA-Execution-Version` is rejected. Supabase verifies the caller server-side.
An E2E login cookie cannot authorize execution or consume sandbox capacity.

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/dsa/execution-capabilities?problemId=<uuid>&problemVersionId=<uuid>` | Authenticated, version-specific Run/Submit eligibility and reasons |
| POST | `/api/dsa/executions` | Validate, atomically persist/replay a job, return HTTP 202, dispatch the durable outbox after responding |
| GET | `/api/dsa/executions/<submissionId>` | Only the authenticated owner's safe result DTO; 404 for another owner |
| DELETE | `/api/dsa/executions/<submissionId>` | Request cancellation; HTTP 202; running remains running until external termination is confirmed |
| POST | `/api/queues/dsa-executions` | Vercel Queue consumer, registered with one `queue/v2beta` trigger |
| GET | `/api/dsa/execution-recovery` | Cron-secret protected recovery/outbox dispatch |

Creation accepts exactly these fields:

```json
{
  "problemId": "<content-item-uuid>",
  "problemVersionId": "<specification-version-uuid>",
  "language": "python",
  "code": "def solve(nums):\n    return sum(nums)",
  "mode": "run",
  "idempotencyKey": "<client-generated-uuid>"
}
```

Code must be nonblank and at most 24,000 characters; request bodies are capped at
128 KiB of actual bytes. Unknown fields (including user IDs) and unsupported
languages are rejected. Identity comes exclusively from verified authentication.
An idempotency key belongs to one user and one code/problem/version/language/mode
combination. Reuse with different content returns 409. First creation returns
`submissionId`, the pinned problem/version IDs, language, mode, `status=queued`,
and timestamps. An identical retry can return the original job's current state.

States are `queued`, `running`, `completed`, `failed`, `timed_out`, `cancelled`.
`running` includes worker allocation and provider startup. Infrastructure failure
is `failed`. A program's wrong answer, syntax/runtime error, or output limit is a
completed evaluation with an explicit verdict, rather than infrastructure failure.
Time limits use `timed_out` and `time_limit_exceeded`.

Run results include eligible public case IDs, input, expected/actual JSON, verdict,
bounded stdout/stderr and measured test time. Passing public fixtures yields
`passed_public_tests`, never `accepted`. Submit results contain only an aggregate
verdict and measured metadata. Counts require the certificate's explicit
`expose_counts=true`. Hidden inputs, actual/expected outputs and logs are never
included. SQL also strips case/log fields from persisted Submit results.

Errors: 400 malformed/oversized JSON or unsupported API version; 401 authentication;
403 foreign Origin; 404 missing/unowned execution; 409 certification/version or
idempotency conflict; 422 invalid creation fields; 429 account/capacity limits;
503 disabled configuration or unavailable infrastructure. Raw SQL/provider errors
and hidden diagnostics are not returned. Existing FastAPI DSA capabilities remain
specific to FastAPI; the web uses the separate Next.js execution capabilities.

## Certification and trusted judging

The additive migration creates `dsa_execution_private.certificates` and `jobs`.
Both have RLS enabled and no browser grants. A single `SECURITY INVOKER` RPC is
granted only to `service_role`, which has the explicit underlying grants it needs.
The service key is used only by verified server routes and the Queue consumer.

A reviewer must separately certify an immutable suite/version mapping with:

- Canonical `problem_version_id` and matching `suite_id`.
- `contract`: `entrypoint` (a Python identifier), `inputMode` (`kwargs`, `args`,
  `single`), `checker` (`exact_json`, `unordered_json`, `numeric`). Numeric
  comparison needs explicit `absoluteTolerance`. Custom executable checkers are
  unsupported. The certificate's checker must match the suite's checker type.
- Explicit `public_run_approved` and/or `hidden_submit_approved`, a certifying
  profile ID and timestamp. `revoked_at` disables a certificate.
- Optional aggregate count disclosure, disabled by default.

There are deliberately **no production certificate seed rows**. A published
statement or reference Python implementation does not imply execution eligibility.
Statements must independently satisfy the existing active DSA domain, published
base version, current definition pointer, published specification, JSON boolean
publication approval, and explicit Python contract-language gates.

Only the latest suite qualifies, and it must be published. Run uses only inline,
verified public cases, maximum 20. Submit requires a hidden case and rejects a
suite with any unverified, missing-inline or external-reference fixture, maximum
100 total cases. There is no fallback to old suites or statement examples.

The evaluation plan is frozen on creation. Workers check both present eligibility
and exact plan equality before execution and after provider completion. Terminal
publication rechecks that plan in the same SQL transaction. Changing fixtures or
revoking certification cannot silently change the comparison for an active job.
Revoke and create a new version/certificate when editorial changes are needed.

Expected outputs remain in trusted server storage. The VM receives source,
entrypoint/input binding, case IDs and inputs only. Comparisons run in TypeScript
outside the VM. Exact JSON distinguishes types and preserves null; unordered JSON
preserves multiplicities; numeric comparison uses its explicit tolerance. Deep,
non-finite or unsafe integer JSON is unsupported and fails closed. Expectations
are bounded to 8 KiB per case and total input JSON to 64 KiB. The combined VM input
must fit 128 KiB, checked **before** the non-idempotent launch marker.

## Isolation and limits

One disposable ConTree operation runs the whole bounded fixture set. Networking
is disabled and the explicit environment is empty, without inherited credentials.
The trusted Python supervisor runs as root inside the disposable VM and launches
each solution as UID/GID 65534. Solutions cannot signal the supervisor; each case
gets a fresh process. Source is never evaluated in the Next.js process.

- Provider operation timeout: 25 seconds; supervisor test budget: 22 seconds.
- Per case: 3-second wall limit and 2-second CPU hard limit.
- Child address space: 256 MiB; supervisor address space: 512 MiB.
- Child process creation disabled; file descriptors and file size bounded.
- Writable VM layer: 128 MiB; no saved result image.
- Captured child stdout: 16 KiB including result protocol; stderr: 4 KiB.
  Public diagnostic text is bounded to 4 KiB per stream. Aggregate output is capped
  below the provider's 64 KiB capture limit. Excess output is an explicit verdict.

The SDK exposes a writable-layer limit but no native per-request CPU/RAM fields;
the verified Linux supervisor enforces those process limits. Test time and peak
child RSS are measured in the supervisor. Wall time includes provider startup and
polling; the UI does not show an invented timer or infer judge success from
ConTree operation `SUCCESS`.

## Durable delivery and concurrency

The job table is a durable outbox. SQL reserves due dispatches with `SKIP LOCKED`
and increments a generation; queue send keys are `<job-id>:<generation>`. Queue
outages or crashes after committing a job are recovered by cron. Messages contain
only a submission ID. The SDK uses the current official `send`/`handleCallback`
APIs from pinned `@vercel/queue@0.8.0` and one `dsa-executions` topic/consumer.

An advisory lock and a unique checked slot column enforce **five occupied slots
across all instances**. Per-user admission permits two active/reserved jobs and
100 creations over a rolling 24 hours; global queued/running/reserved jobs are
bounded at 200. Completed executions do not become learner mastery or practice
history entries. They remain authoritative execution records; no learning outcome
is inferred from public success.

Worker ownership uses a random fencing token and 90-second lease, longer than the
60-second function budget. Expiry lets another worker resume the **same reserved
slot**, never reuse a slot while an external operation might still be running.
The launch marker commits before the only spawn POST. An operation ID is then
persisted; duplicate deliveries inspect/resume it. Workers perform bounded ticks,
and operation discovery has a bounded time budget. Queue retries are bounded with
backoff; an outbox recovery dispatch can recover an abandoned job after delivery
exhaustion. Requests expire after five minutes or 40 processing claims; active
operations are cancelled before their slot is released.

If the spawn response is lost, the worker discovers its unique `dsa-<job-uuid>`
hostname. It never repeats the ambiguous POST. Unconfirmed startup is explicitly
failed/quarantined, and the slot remains reserved until an operation is found and
confirmed terminal. This can reduce capacity during a provider outage, rather
than exceed five operations. A crash before the actual POST can require an
operator to confirm no operation exists before releasing a quarantined slot.
There is no automatic time-based unsafe release. Discovery inspects at most 200
summaries from the relevant time range; unresolved jobs need operator inspection.

## Web behavior

Run/Submit enable only for the exact eligible published version, Python, and
learner view. Draft preview never grants execution. Shortcuts are Ctrl/Cmd+Enter
and Ctrl/Cmd+Shift+Enter. The results panel shows real queued/running/terminal
states, cancellation, public results or hidden aggregates. Layout/language changes
preserve the result state. Refresh restores the saved job ID and resumes polling.
Polling backs off to ten seconds, pauses in background tabs, and stops after 120
checks or five consecutive errors; the user can explicitly resume.

An unconfirmed creation retains its original code and idempotency key in account/
problem/version-scoped browser storage. Retry uses exactly that original request,
including after refresh. A changed editor draft cannot accidentally duplicate an
unconfirmed submission. The current submitted code and subsequent edits are
identified separately in the results copy.

## Production rollout status (2026-10-15)

1. Applied `supabase/migrations/20261015172042_dsa_execution_jobs.sql` to the existing
   recallstack Supabase project as part of the authorized end-to-end configuration.
   The repository filename matches the deployed migration history. Verified that
   anon/authenticated cannot execute the RPC, service_role can, and no publication,
   certificate or learner rows changed.
2. Production `CRON_SECRET` is configured as a sensitive value. Existing ConTree
   settings and the inference key are preserved. `SUPABASE_SERVICE_ROLE_KEY` is
   configured and verified against the private RPC. It is sensitive in Vercel
   Production/Preview/Development and present only in ignored local server config.
   Production and local `DSA_EXECUTIONS_ENABLED=1`; exact publication/certification
   gates still disable every unavailable problem.
3. Deploy the reviewed routes and `vercel.json` trigger/recovery configuration.
   The confirmed Vercel Hobby plan permits daily cron only, so the safety sweep is
   `0 3 * * *` UTC (Hobby timing is approximate). Creation, owned status reads and
   cancellation also dispatch the durable outbox via `after()`; SQL reserves each
   due job for 60 seconds to avoid duplicate publication storms. Queue retries
   handle ongoing execution. With no browser traffic after a queue outage,
   recovery may wait until the daily sweep. For minute-level unattended recovery,
   use an authorized external scheduler or a plan supporting that cadence. Queues
   use Vercel runtime OIDC; no queue API secret is added.
4. Independently publish/certify suitable problem and suite versions. Do not
   certify the 375 imports merely to enable UI buttons.
5. With `DSA_EXECUTIONS_ENABLED=1`, perform an authenticated hosted Run,
   Submit, cancel, duplicate-delivery and recovery check. Verify operation cleanup
   and slot counts. Only this hosted check can establish deployed Queue delivery.

Pause new creation with the flag if needed. Existing processing requires the
worker flag too; during a shutdown, cancel/drain active operations before disabling
workers. Recovery, private job inspection and provider inspection are operational
tools, not browser endpoints. Do not delete reserved jobs, clear a slot blindly,
or delete an owning profile until its operations have been reconciled. Terminal
jobs with no reserved slot can follow the application's approved retention policy.

## Verification

Use Node 22+. `npm run test:executions` runs pure contracts/judging/worker checks;
live provider tests are opt-in using `DSA_LIVE_SANDBOX=1`. The optional provider
tests run only fixed programs, use disposable operations sequentially, inspect
provider capacity, and cancel any owned unfinished operations.

The PostgreSQL tests run only against a fresh loopback database named
`dsa_api_test_*`, never the configured production database:

```powershell
# From backend/, with installed local PostgreSQL binaries:
$env:DSA_LIVE_SANDBOX='1'
uv run python scripts/run_postgres_tests.py --postgres-bin .pytest_cache/postgres-tools/pgsql/bin tests/dsa/test_execution_storage.py -q
```

This includes a loopback HTTP RPC bridge to the actual PostgreSQL functions, the
real TypeScript repository/worker, live ConTree fixed-program execution and
persisted public/hidden-safe results. It does not pretend to be a hosted Supabase
or Vercel Queue deployment test. Authenticated UI transitions are verified using
browser fixtures; anonymous and cross-origin API rejection is exercised against
the real local Next.js handlers. Final check results are recorded below.

References: [Vercel Queue SDK](https://vercel.com/docs/queues/sdk),
[Queue consumer security](https://vercel.com/docs/queues#consumer-function-security),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[ConTree client](https://github.com/nebius/contree-client/blob/master/client-js/README.md).


## Tutor and canvas integration

The existing streaming ReasonAI endpoint, LangGraph orchestration and server
conversation store are reused. Versioned workspace requests carry only problem/
version identity, editor language, learner code/approach/notes, preview intent and
an optional public execution ID. Before model invocation, the server reloads the
exact specification from the canonical API using the verified user's credentials;
preview remains subject to the backend reviewer check. It hydrates bounded
description, constraints, public function contract and statement examples.
Truncation is explicitly marked. Caller-supplied hydrated fields are rejected.

Public execution context is resolved through the owning user's stored Run;
problem/version and mode must match. Only an explicit public result allowlist is
forwarded, never hidden Submit results, private plans or expected hidden outputs.
Saved results are identified as prior evidence because the editor may have changed.

Socratic and Direct mode change the actual tutor instruction. The ten workspace
actions use the same authenticated streaming transport. Failed-test assistance
requires a saved public result. Conversation IDs are scoped by account/problem/
version/preview in local storage and restored through the existing owned server
conversation API; chat content is not duplicated in browser storage. Clearing
chat detaches this saved ID. Existing link-based DSA pages retain their behavior.

Canvas lessons retain validated existing array/graph/grid scenes with step/play
controls. They are labeled AI-generated educational lessons, never runtime traces
of editable code. No instrumented runtime trace is claimed.


## Authenticated API smoke

`DSA_SMOKE_CREATE_USER=1 node scripts/smoke-dsa-api.mjs` creates one temporary
confirmed test account through the admin API, signs in, verifies real auth,
capabilities, missing-version rejection, blank code, absent ownership and
cross-origin rejection, then deletes the account in `finally`. No submission or
publication is created. It defaults to localhost; use `DSA_SMOKE_URL=https://www.reasonai.tech`
for the hosted check. Only known local/production hosts are accepted. Keep service
credentials in ignored local configuration. This opt-in test does not mail users.


The cron-secret-protected recovery route also accepts `POST {"probe":true}`. It
publishes one message for a fresh missing job ID. The actual consumer must read
the private RPC and acknowledge that ID before any sandbox call; it logs
`[DSA_EXECUTION_LIFECYCLE]` with the probe ID and `sandboxStarted:false`. Correlate
that ID in Vercel runtime logs to verify hosted Queue delivery without approving
content, creating a job or executing source. Anonymous calls cannot publish probes.


## Verification results ? 2026-10-15

- All 57 backend DSA tests passed in disposable PostgreSQL. The eight execution
  storage checks also passed with live ConTree enabled. The HTTP RPC bridge drove
  the real TypeScript worker and PostgreSQL fencing for two development problems
  (array total and binary search), each with public Run, hidden Submit and an
  incorrect solution. Every owned operation was reconciled and held slots were zero.
- Fifteen execution/context unit checks passed; five optional live/bridge checks
  are deliberately skipped in the default offline run. All 76 existing DSA tutor
  provider/agent/streaming checks passed after the tutor changes. The broader
  server/state suite passed all 518 tests.
- The 44 DSA browser checks passed, including existing pagination/workspace flows.
  The full browser run passed 163 of 173 initially; nine admin/diagram cold-start
  navigation timeouts passed on rerun. One stale landing assertion referenced
  the previous page design; it now checks the existing public brand/heading and
  protected Canvas route and passes. The last workspace/execution rerun passed
  all 18 DSA checks.
- The opt-in live tutor used only a declared development fixture. Actual
  explanation/hint first text arrived in approximately 0.9?2.2 seconds; the
  validated educational visual took about 49 seconds. A preceding attempt
  demonstrated validation failure and successful bounded repair. These are
  observed development timings, not service guarantees or runtime code traces.
- Real Supabase-session local API smoke passed: authenticated capabilities 200,
  anonymous 401, ineligible version 409, blank code 422, missing/unowned IDs 404,
  cross-origin 403. The temporary smoke account was deleted.

No production content was approved or certified to make tests pass. Production
has zero published DSA versions and zero execution certificates. Authenticated
hosted judging of actual learner content remains dependent on independent
publication and test certification; development fixtures do not establish it.


## Hosted verification

The production deployment of `0fbfd247824ee5d5caea2a43db57d2eb08ed49cb` reached
READY. Against `https://www.reasonai.tech`, all eight authenticated/anonymous API
smoke cases passed with the execution version header. The protected delivery probe
`7694f657-69c6-49ce-9960-56cf32bb9638` was delivered to the real Queue consumer;
Vercel runtime logs confirmed `acknowledged` and `sandboxStarted:false` after its
private RPC read. No synthetic job or production certificate was inserted.

The hosted browser check used an actual temporary Supabase session, without API
fixtures. The canonical public catalog returned 200 with zero items, rendered
the truthful empty state at 1440px and 390px, had no page errors and no horizontal
overflow. Both screenshots were inspected. All temporary smoke accounts were
deleted; the production database verified zero jobs, reserved slots, certificates,
published versions and leftover smoke accounts.

Use `DSA_SMOKE_BROWSER=1` with the opt-in API script to repeat the real browser
check; `DSA_SMOKE_QUEUE_PROBE=1` adds the hosted queue probe. Match the returned
probe ID in Vercel runtime logs. Neither result establishes judging against
published learner content while publication/certification remain pending.

Release checks also exposed two existing CI dependencies: formatting in one
knowledge integration test and a browser persistence test requiring live model
credentials. The formatting correction preserves behavior. Browser tests now run
a loopback-only SSE provider for persistence assertions, selected solely by the
Playwright web-server environment; production uses its existing configured
provider. Real model checks remain separately opt-in and were run successfully.
The complete backend lint/format/type checks and all 218 unit tests passed locally.


The final local PostgreSQL run passed all 64 integration tests (including existing
knowledge/content behavior), and the credential-free DSA browser run passed all
44 cases. The broader browser run passed 171 cases with the opt-in real-API case
skipped; its remaining navigation test was updated to dismiss the workspace's
initial modal before interacting with the global user menu. That three-case
bookmark regression suite then passed. Production Run/Submit eligibility remains
subject to independent content publication and suite certification.
