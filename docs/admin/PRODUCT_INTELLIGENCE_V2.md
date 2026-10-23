# REASONAI PRODUCT INTELLIGENCE V2

Local implementation and evidence report, October 22, 2026; cleanup and closeout continued October 23 (client date). Unrelated uncommitted work was preserved. Superseded unused Admin UI was removed at the user's follow-up request. No PR, push, deployment, paid inference, production DDL, backfill mutation or production identity mutation was performed.

## 1. Legacy Data Issues Found

The legacy overview, user detail and user list derive progress from `practice_attempts`, `activity_events`, `review_history` and `content_items`. An independent practice outcome is a self-reported learning result. It cannot establish an official DSA solve. Local Pyodide Runs, server Runs, provisional passes and certified official Submits also have different semantics.

The existing backend Growth corrections in the workspace already distinguish these sources. Those APIs and their corrections were preserved; the superseded unreachable Growth screen was removed. The new main overview and users page use `/admin/analytics/*`; User 360 uses modern feature and timeline APIs. Legacy practice and activity remain explicitly labeled. Role management remains in the existing authorized workflow.

## 2. Root Causes

Domain records were added over time without a shared navigation/session contract. Canonical server state was absent from the legacy user progress queries. Existing AI run persistence has no complete provider billing ledger. System Design's local browser repository is separate from backend Diagram Studio persistence. Realtime rooms identify capability holders/actors, not verified profile UUIDs. Historical source attribution, browser sessions and local Runs cannot be reconstructed from these records.

## 3. Canonical Data Sources

Read-only connected schema inspection found the `recallstack` project `jlqawpdsyptfxspyqnsu`, PostgreSQL 17.6. The inspected snapshot contained 45 profiles, 375 published problems, 15 server jobs and 12 server Submits, including seven completed official accepted attempts. Those seven are attempts, not necessarily seven distinct solved problems. No problems, certificates, fixtures, judge code or execution contracts were modified.

Production migration history differs from local filenames. The latest inspected entries included `20261021071723 dsa_official_plan_lossless_integer_wire` and `20261021071300 admin_role_audit_security_lockdown`. Unlike the October 21 report, the inspected role, role-grant and audit tables now have RLS enabled and the inspected browser grants restricted. The telemetry schema was absent. Repository migration presence is never treated as proof of production installation.

### Source and coverage audit matrix

| Feature | Canonical persistence / existing APIs | Evidence already persisted | New instrumentation / query change | Trust and remaining coverage | Admin dependency |
|---|---|---|---|---|---|
| Identity | `profiles`, Supabase Auth, `/api/v1/me`; server-loaded role grants | Profile creation and authorized roles | Canonical profile-created timeline; authenticated acquisition insert once near signup; browser first touch survives same-tab OAuth | Profile creation is canonical; referrer/UTM is client-reported. Historical attribution remains Unknown. Pre-auth signup intent is not ingested anonymously. | Overview, Users, User 360 |
| Navigation | No previous shared session table | Legacy content opens cover only selected learning paths | Shared web/Flutter screen events, feature entry/exit, foreground lifecycle and 30-minute inactivity policy | Partial history from collection rollout. No geography, fingerprint, keystrokes or raw paths/query strings. | Sessions, timeline, adoption, cohorts |
| DSA local execution | `use-local-python-run.ts`, pinned Python worker | Browser-only state; no authoritative solve | Run start/completion/failure, bounded test counts/timings and error phase; editor initialization/draft milestones and problem opens | Client-reported. Never contributes official attempts or solves. No submitted source/fixtures/output transmitted. | DSA tab, timeline, observed funnels |
| DSA server judging | `dsa_execution_private.jobs`, certificates/contracts; `/api/dsa/executions`, Vercel execution worker | Request mode, creation time, queue/execution state and trusted result | Read canonical job metadata directly. Official acceptance requires Submit + completed + nonempty certificate + official grading + accepted verdict. | Authoritative private server storage. Existing jobs use canonical snapshots; future meaningful queue/phase/verdict transitions are captured by a small private journal. Heartbeats are excluded. | Official acceptance, unique solves, problem attempt history |
| Legacy practice | `practice_attempts`, `content_items`, `review_history`, legacy admin endpoints | Self-reported learning/revision outcomes | Preserved under Legacy Practice / Legacy Activity | Not official judge evidence. No legacy-to-official backfill. | Explicit legacy tabs and `/admin/dsa` |
| Code Intelligence | Public report projection and `dsa_reports_private.reports/attempts`; report worker/API | Report status, source submission, final provider usage where supplied | Canonical report creation/status; report opens; final report input/output tokens and provider duration queried separately | Token totals cover final stored report measurements, not all failed/retried AI calls. Costs remain unknown. No report documents/source code read into analytics. | DSA/AI metadata and timeline |
| Feed | `user_story_events`, `user_story_state`, `knowledge_story_topics`, preferences; `/api/v1/knowledge/*` | VIEW/OPEN/SAVE/UNSAVE/HIDE/UNHIDE/SHARE/ASK_REASONAI, saved/hidden state | Reuse existing interaction records; add navigation/source clicks/Ask intent. Existing web impression threshold is 50% intersection for 800ms, with foreground check. Minimal private archive protects future expired-story actions. | An impression is exposure, not reading. Canonical Feed actions remain client interaction evidence. Already deleted historical stories cannot be reconstructed. | Feed counts, story/topic action tables, timeline |
| ReasonAI DSA/System Design | `reasonai_conversations`, `reasonai_runs`; persisted orchestration stream | Run lifecycle and sanitized status/error metadata | Client message/cancel intent. One private server measurement per finished stream records tool counts/latencies, model tiers and first output time. | Run records are canonical product history, not invoices. The new measurement RPC is service-role-only. Provider calls/tokens/costs are not inferred from runs. | AI tab, tool/model tables, diagnostics |
| System Design | Browser document repository; backend `diagrams` for Diagram Studio; `/api/v1/diagrams`; existing AI routes | Local saves, server design creation/revision where installed; AI runs | Meaningful editing start, bounded local node/edge operation summaries, save success/failure, export intent and local document load | Client local saves do not prove backend persistence. `diagrams` was absent from the inspected deployed schema, so that canonical source is unavailable there. Mobile System Design is Not applicable. | System Design tab and timeline |
| Collaboration | Go room manager/protocol and `/metrics`; web realtime client | Room/connection/operation counters and in-memory room state | Authenticated web join/leave/reconnect/error observations. Go adds failure/capacity/origin rejection, heartbeat failure, recovery, acknowledgement and peak connection counters | Go actor IDs are not profile IDs. No verified account-level server participation, secrets, cursors, heartbeats or socket payloads are inserted into product events. | Client-reported participation; operational Prometheus metrics |
| Mobile | Flutter router, canonical DSA API/execution session, existing Feed API, ReasonAI stream, account-local Drift DB | Existing canonical domain actions; local receipts/drafts | Compatible registry, lifecycle/screen/problem/Submit/AI/error metadata, app/build/OS fields, bounded persistent retry queue and opt-out | No new advertising/device identifiers. Offline retries keep event IDs. Backend canonical outcomes have Unknown platform unless observed client evidence exists. | Same overview, filters and User 360 |

All 63 registry events have source references, and the disposable PostgreSQL test ingests and retrieves every registered event through Admin. Static references and registry round trips do not prove execution of every emitting branch in a live device journey. Unavailable measurements remain unavailable; see section 15.

## 4. Telemetry Architecture Implemented

`backend/src/recallstack/modules/telemetry/registry.json` is the versioned wire registry. `backend/scripts/generate_telemetry.py` generates TypeScript property types and the Dart event enum/property validator schema. Python validates the same allowlist. Unknown events, extra envelope/property fields, private content fields, nested values, invalid enums and unbounded values are rejected.

Clients → authenticated FastAPI batch endpoint → private PostgreSQL tables → bounded canonical/client projections → existing Admin authorization and access audit. No analytics SaaS, database, broker or new paid queue was introduced.

The server derives the profile ID, environment and receive timestamp. Clients can send only `web`/`mobile` evidence, never official backend outcomes. Event UUID primary keys make retries idempotent. Account/minute quotas are transactional across API instances. A lost response can be retried with the same IDs without repeating session counters.

Client occurrence time is retained as untrusted evidence. Plausible timestamps are bounded to the prior seven days and five minutes into the future; future effective times are clamped to receive time. Implausible times use receive time and are marked invalid. Delayed and invalid clocks have separate health counters. Cohorts exclude delayed/invalid clock evidence and require an observed signup session.

## 5. Events Implemented by Feature

Actual paths now emit screen/feature and foreground lifecycle events; DSA opens, editor/draft milestones, language selection, Run/Submit intents and local Run outcomes; Feed source/Ask intent; AI message/cancel intent; System Design load/edit/save/export intent; signed-in collaboration state transitions; and sanitized client/network errors.

Canonical profile creation, jobs, report rows, AI runs, Feed actions and persisted designs are projected without a second event write. Replayed history therefore cannot double-count them. Canonical job properties contain only mode/status/allowlisted verdict/provenance booleans. The original source record ID remains the timeline identifier.

Local committed canvas edits accumulate bounded node-add/delete and edge-add/remove counts. A summary is queued at most every 30 seconds, on backgrounding or editor exit; no node IDs, labels, diagram contents, drag coordinates or pointer movements enter telemetry. Remote edits are not attributed to the local account.

The server AI stream reducer copies only numeric tool metadata and allowlisted model tiers. It never copies text, tool arguments, summaries, sources or transcript parts. Missing complete provider usage remains Not tracked. Search tool requests are explicitly different from billed Tavily HTTP requests.

## 6. Database Migrations

`web/supabase/migrations/20261022134712_product_intelligence_v2.sql` was created with the Supabase CLI and tested on disposable PostgreSQL. It is **not applied to production**.

New private tables: installation/collection coverage, product events, observed sessions, first-touch attribution, explicit account classifications, daily ingestion health, minute quotas, AI run measurements, a minimal authoritative DSA transition journal and deleted-story action metadata. New indexes cover user/time, feature/time, event/time, session/time, correlation and receive time.

The schema and all tables revoke browser access and enable RLS without permissive policies. Only server/service-role access is granted. The typed AI metadata RPC uses `SECURITY INVOKER`, an empty search path, an ownership check, and explicit execute revocation from PUBLIC/anon/authenticated. No service key is exposed in web/mobile bundles.

User-linked rows cascade on profile deletion. AI measurement rows also cascade on run deletion. Expired-story archiving retains only record ID, owner, story UUID, action and timestamp; explicit user/event deletion does not recreate analytics. There are no story contents in the archive.

## 7. APIs Changed

Existing Admin APIs are preserved. New `/api/v1` routes:

- `POST /telemetry/events`: 1–30 events; 64 KiB request cap; 600 account events/minute; strict registry/version validation; accepted/duplicate receipt.
- `GET /admin/analytics/overview`, `/features`, `/users`, `/funnels`, `/cohorts`, `/health`.
- `GET /admin/users/{user_id}/features`, `/telemetry`, `/sessions`.
- `PUT /admin/analytics/users/{user_id}/classification`: explicit admin-verified internal/judge/demo/test classification or removal; never inferred from email or user-editable metadata.

Reporting windows are inclusive UTC calendar days through one server as-of timestamp, with 7/30/90-day choices. DAU/WAU/MAU use fixed 1/7/30 UTC day windows. Admin queries run in repeatable-read transactions, audit access, and return private/no-store headers. Lists and sessions use bounded limit/offset; timeline uses opaque `(timestamp, source-ID)` cursors. Web types are regenerated from checked-out OpenAPI.

## 8. Admin Screens Updated

The main overview has feature sections, genuine daily activity bars with accessible underlying values, definitions/sources, coverage and refresh/error states. Funnels, cohorts and health are separate views. The user list supports server-side name/email search, registration/activity/engagement/returning/feature/mobile/internal segments and explicit internal exclusion.

User 360 exposes Overview, Timeline, DSA, AI, Feed, System Design, Sessions, Roles and labeled legacy tabs. Canonical facts without recorded sessions remain ungrouped historical records. No session boundaries are invented. First-touch acquisition and classification remain Unknown if absent. Legacy readiness/streak placeholders do not appear in the modern summary.

### Unused code removal

Reference searches confirmed that the old `GrowthScreen.tsx` and `UsersScreen.tsx` had no route consumers after the Product Intelligence replacement. Both were removed, along with their barrel exports, `useGrowth` / `useAdminUsers`, the unused users cache key, nine unused local type aliases, the orphaned `createAdminUser` test factory and the unreferenced Growth response fixture. Generated API schemas, historical evidence artifacts, supported backend contracts, the routed Legacy Practice screen, user legacy-history tabs and role management remain supported. No domain records or migrations were deleted.

## 9. User 360 Validation

The PostgreSQL/HTTP test uses a local fixture identity and six canonical jobs: server Run, failed Submit, provisional pass, pending Submit and two repeated official accepted Submits. Expected and actual: one official unique solve, two official accepted attempts, five server Submits, one server Run, one observed local Run, official acceptance rate 2/3. Duplicate client events are stored once and do not inflate sessions.

The browser suite uses a disposable database and test-only authentication dependency override. Real ingestion is retrieved through real Admin queries and rendered in the browser. It is not a production login proof. The saved [timeline screenshot](../evidence/screenshots/2026-10-22/product-intelligence/user-timeline-fixture.png) is labeled fixture evidence.

## 10. Historical Coverage and Limitations

Canonical records are reconstructed at query time, with stable source IDs and original creation timestamps. A job row's current state is a snapshot, not a fabricated sequence of historical transitions. No bulk synthetic event backfill is needed.

`backend/scripts/telemetry_lifecycle.py` defaults to a read-only dry run. It reports canonical counts and retention candidates. Explicit `--apply` performs at most 10,000 deletes/table per invocation and refuses remote mutation. Defaults: event/AI/archive detail 90 days, session metadata 30 days, quota rows two days, ingestion aggregates 730 days. Scheduling a production cleanup invocation is a rollout gate, not something installed in this task.

Retention is exactly D1/D7/D30 UTC days after profile creation, with mature days only and an observed initial session. It is not a rolling days-7–13 formula. Old/unobserved signup cohorts are excluded. Funnel steps require the same authenticated user and recorded journey, in order within 24 hours. Run-to-Submit intent requires the same recorded problem and is not official execution conversion. The funnels view separately reports canonical accepted/completed-official Submit conversion, seconds from signup to the first observed meaningful action, consecutive within-session feature transitions, feature revisits across observed sessions, and first-observed versus returning meaningful sessions. These definitions explicitly avoid claiming complete lifetime history.

## 11. Privacy/Security Results

Anonymous/non-admin Admin access, forged client user IDs, unknown official-result names, private/oversized properties, duplicate UUIDs, future clocks, table grants and deletion are covered locally. All production reads in this task were schema/advisor/count inspection.

Optional collection is disabled by default: web build flag `NEXT_PUBLIC_PRODUCT_TELEMETRY_ENABLED`, server AI flag `PRODUCT_TELEMETRY_ENABLED`, Flutter `--dart-define=PRODUCT_TELEMETRY_ENABLED=true`. Web respects DNT/GPC and a visible browser opt-out; mobile has an account-local opt-out. First-touch collection respects the web collection gate. Buffers are owner-scoped and not reassigned on account change.

The live security advisor still reports 35 unrelated public tables with RLS disabled, a mutable function search path, public extension placement and callable definer-function warnings. These remain production integrity risks; no broad legacy grant changes were attempted. [Supabase RLS finding remediation](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

## 12. Performance Measurements

[Actual benchmark and query plan](../evidence/runs/2026-10-22/product-intelligence/benchmark.json): disposable PostgreSQL 17; 100 fixture users, 10,000 events, 500 jobs; ten complete overview reads. Final observed median 283.80 ms and nearest-rank p95 452.11 ms. Other local verification processes were running on the same workstation. This is a local fixture baseline, not a production percentile or load test. Independent SQL matched 100 registrations, 500 Submits, 300 official accepted attempts and 100 distinct solved user/problem pairs.

The user timeline plan uses the user/time index. No partitioning, materialized aggregates or duplicate business counters were justified at the observed production volume. Client buffers cap at 200 events / 128 KiB, batches at 30, retries at five. Browser flushes use bounded keepalive requests; mobile persists the queue in the existing account-local Drift store. Failures cannot block judging, editing, authentication or AI transcript correctness.

## 13. Tests Passed / Failed / Skipped

[Verification manifest](../evidence/runs/2026-10-22/product-intelligence/verification.json) records commands, results and evidence scope. All latest completed checks pass; opt-in live checks remain unverified.

| Check | Result | Scope |
|---|---|---|
| Backend non-integration regressions | 351 passed; 97 integration cases deselected | Authentication/Admin, business logic, privacy and contract regressions |
| Selected PostgreSQL integration suites | 30 passed | Telemetry, Admin analytics/content/user inspection/Growth/HTTP; actual isolated database and reviewed migration |
| Admin plus real-pipeline browser suite | 18 passed after cleanup | Fixture auth, disposable PostgreSQL, real collector and Admin rendering; no production login claim |
| Web types / lint / production build | Passed after cleanup; 39 static pages | Node 22; generated API contract |
| Flutter | 77 passed; 1 live probe skipped; analysis clean | Full suite; final generated-registry telemetry subset also 3 passed |
| Go realtime | All packages passed | Go 1.27 Docker toolchain |
| Existing DSA execution regressions | 37 passed; 6 opt-in live cases skipped | Shared pinned Python harness and execution semantics |
| AI / System Design state regressions | 525 passed | Existing deterministic provider/state suite; paid provider probes are excluded |
| Backend static checks | Ruff clean; mypy clean | Telemetry module and supporting scripts/tests |

The official-outcome fixture independently verifies one unique solve, two accepted attempts, five Submits, one server Run, one local Run and a 2/3 acceptance rate. Difficulty/topic metadata and first-accept attempt ordering are checked. A Submit for a different problem cannot convert a DSA Run journey. All 63 client event names are round-tripped. Account classification, retained/deleted-story behavior, server-only AI RPC, journal idempotence, mature cohorts, feature transitions/revisits and observed-session reconciliation are exercised. The benchmark compares its four KPIs against independent SQL, with expected/actual values saved in the artifact. One post-cleanup browser startup timed out before tests; rebuilding the generated development cache resolved it and all 18 tests passed on rerun. The production build completed with its existing local QueueClient region warning. No full 375-problem recertification was performed; certified definitions and judge logic remain unchanged.

## 14. Deployment and Migration Gates

1. Review the additive migration against actual deployed dependencies/grants and backup/rollback procedures. Apply only with separate explicit authorization.
2. Keep collection disabled while installing the schema; deploy compatible backend/web/mobile and configure the appropriate release flags and service-only AI writer.
3. Validate real supported login/signup, attribution consent, local Run and official judging, Feed, AI, design and collaboration journeys in an authorized preview/live session. No disposable production identities were created here.
4. Reconcile Admin against independent SQL, review new table/function permissions, schedule bounded retention cleanup, and monitor ingestion rejection/lag/drop metadata.
5. Address the unresolved legacy security findings before calling production analytics tamper-resistant.

Disabling collection flags is the first rollback step. Keep canonical data and private telemetry tables while reverting application readers; do not destructively drop production history as part of a dashboard rollback.

## 15. Known Remaining Gaps

- Historical geography/referrals/page views/local Runs/sessions and already deleted Feed actions have no recoverable evidence.
- Complete AI provider-call/token/billing and actual Tavily invoice accounting are unavailable. Final Code Intelligence usage and server tool observations are labeled separately.
- Verified Go profile association and durable per-room account history do not exist in the capability protocol. New counters are process-local operational metrics, not durable customer analytics.
- Historical intermediate worker/judge transition timestamps cannot be reconstructed. The new journal observes future queue/phase/verdict changes without copying code or fixtures and without counting outcomes twice.
- Authoritative time-to-solve/true abandonment and pre-auth signup funnel attribution remain unavailable. Bounded structural canvas counts and observed journey stops are client evidence, not complete operation history or proof of abandonment. Not every event-emitting branch has a real device/live-session execution proof. Absence must not be interpreted as zero usage.
- Production cleanup scheduling, authorized live Admin verification, paid judge/provider probes and full mobile-device end-to-end journeys remain release gates.

## 16. Final Readiness Verdict

The local candidate provides the secure collection foundation, canonical modern DSA correction, cross-product User 360, compatible web/mobile metadata and genuine health/coverage views. Production rollout and full historical/lifecycle coverage are **not certified**. Do not present this as complete production telemetry until the documented rollout gates and remaining feature coverage gaps are closed.
