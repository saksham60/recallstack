# ReasonAI Admin readiness audit

October 21, 2026. The original local audit was based on `29240fbc4fb6ab38339ab2126b91c6ac2d87e789`. Its evidence below predates publication. The user subsequently authorized pushing the Admin corrections, integrated onto current main `ede49dff80d60d4bb8b2ee70e3769051c392ec7b` in an isolated checkout. Earlier unfinished mobile, hackathon and DSA work was excluded. No PR, manual deployment, Devpost change, paid inference, production DDL or production admin mutation was performed.

Publication verification is recorded separately in [post-sync-verification.json](../evidence/runs/2026-10-21/admin-audit/post-sync-verification.json). The publish candidate also includes minimal Next.js build compatibility fixes: Request wrappers for three existing Queue callbacks and local scope for the landing focus selectors. Queue behavior and landing content are unchanged.

**Verdict: local corrections verified; production freeze approval remains blocked by database access exposure and the unavailable authorized live Admin session.**

## Growth 422 root cause and evidence

The original handler used `Annotated[Literal[7, 30, 90], Query()]`. Query parameters arrive as strings; the integer literal contract rejected `"30"` before calling the service or database. A local HTTP reproduction returned this actual body:

```json
{"title":"Request validation failed","status":422,"detail":"query.days: Input should be 7, 30 or 90"}
```

The historical contract fails for all three ranges; `IntEnum` succeeds for 7/30/90. [Actual local responses](../evidence/runs/2026-10-21/admin-audit/historical-growth-reproduction.json). The existing fix is commit `7493e871853d9e389ad27cbdc1f3fb909e14544b`, present in this checkout and advertised by production OpenAPI. It was preserved and regression-tested; this audit does not claim a new parsing fix or a captured current authorized production 422.

Live production returned 401 without a token and 403 for the normal judge account (loaded roles: empty). CORS headers were present (`Access-Control-Allow-Origin: *`); these were actual HTTP failures, not CORS failures. The connected browser failed initialization (`failed to write kernel assets`), and an authorized Admin session was unavailable. A normal admin login and its current response body/request ID are still needed. No fake JWT, production bypass, impersonation, reset, or promotion was used. [Live HTTP evidence](../evidence/runs/2026-10-21/admin-audit/production-http.json).

Frontend tracing found another defect: Growth duplicated the authenticated client, discarded error details, lacked its timeout, and hid range controls on failure. It now uses generated API types and the shared client, shows typed 401/403/422 errors with server details, retains range/refresh controls, and disables automatic retries for this query.

## Prioritized findings

| Priority | Finding | Correction / status |
|---|---|---|
| P0 | Role definitions, grants and audit tables accessible through browser grants with RLS disabled | Narrow migration prepared and tested locally. **Not applied**; production gate remains. |
| P0 | Historical Growth integer-literal query parsing | Existing IntEnum fix confirmed; old failure reproduced, current contract tested. Authorized live request blocked. |
| P1 | Missing server executions; empty conversations and Feed impressions counted as engagement | Corrected existing aggregates. Run/Submit, official/provisional results and Code Intelligence reports counted separately. |
| P1 | Reporting inconsistency and future timestamps | One SQL snapshot, inclusive UTC start/as-of upper bound, exact zero-filled 7/30/90-day series, session-timezone/DST regression coverage. |
| P1 | Registered records called Active; learning outcomes looked like official judging | Clear registration/activity/engagement/legacy-progress labels; API compatibility preserved. |
| P1 | Topic percentages multiplied twice | Backend 0–100 value converted before percentage formatting: 30 becomes 30%, not 3,000%. |
| P1 | Mixed date offsets or reversed completion bounds | Dates compared as UTC; reversed completion range rejected with 422 before querying. |
| P1 | Arbitrary historical audit JSON returned | Server and UI allow only positive integer page/page_size metadata; nested/unapproved values omitted. |
| P1 | Privileged HTTP caching unspecified | Admin responses use private, no-store and Vary: Authorization. |
| P1 | Empty list pages hid navigation | Empty states retain pagination and First page recovery. |
| P1 | Diagram mutation failures unhandled; repeated clicks possible | Visible errors, synchronous pending guard, refresh recovery and horizontal scrolling on narrow screens. |
| P2 | Country, attribution, complete retention/journeys and costs unavailable | Coverage explicitly disclosed; no invented locations, sources, retention or zero costs. |

## Module coverage

| Module | Verification | Limitations |
|---|---|---|
| Platform/Growth | Frontend → generated GET → Supabase bearer → database-loaded admin grant → aggregate SQL → strict response → UI. Filter, loading, error, empty, refresh, boundaries and genuine stored values checked. | Authorized production Admin round trip blocked. |
| Registrations/users | Total matched overview and independent SQL. Pagination/search/sort/eligibility and privacy contracts tested; grouped queries avoid per-user lookups. | Includes internal/judge accounts; no reliable customer classification exists. |
| User detail/activity | Actual DB schemas checked; signup/attempt/review ordering, distinct pairs, difficulties, nullable metrics and role controls tested. | Timeline and per-user problem counts cover legacy learning, not a complete cross-product journey or V3 execution history. |
| DSA overview/problems/detail | 375 published records confirmed. Unique completions, first-attempt semantics, topics, filters, percentages, unavailable metrics and empty detail states tested. | Legacy practice outcomes are self-reported, not judge verdicts. Server execution volumes are separate Growth counters. |
| Feed | Persisted VIEW impressions distinguished from deliberate OPEN/SAVE/SHARE/ASK actions. All 55 observed records were VIEW. | Feed AI without durable runs is not counted; missing events cannot be reconstructed. |
| System Design | Admin catalog/editor boundaries reviewed. Persisted System Design AI runs measured. | Canvas-only sessions/collaboration and complete design journeys are not instrumented. |
| Diagram Studio | API CRUD, owner isolation and optimistic revision tests; library mutation/error/loading/refresh fixes tested. Existing local network recovery preserved. | Backend owner library list has no pagination; large libraries remain a scaling watchpoint. |
| AI/errors/Code Intelligence | Persisted runs, error codes, interrupted runs, reports created and failures counted. No prompts/source/hidden fixtures/report documents in analytics responses. | Runs can contain multiple model calls; error count can overlap interrupted count. No complete usage/billing ledger. |
| Content administration | Authorized HTTP create/document/resources/review/return/publish/new-version/archive workflow exercised against disposable PostgreSQL. | No production content edited. Review/row-version safeguards retained. |
| Audit/security | Filtering/pagination/redaction/no-store, database roles, grant/revoke and final-admin safeguard tests. | Production table exposure still undermines stored-data integrity. Existing audit-write failure behavior remains internally logged and nonfatal. |

All **25 registered Admin operations** have local anonymous/non-admin tests. Authorized success coverage spans eight analytics operations, all legacy/support user reads and role mutations, and every content operation. Live verification covered 13 ordinary-user read requests (including 7/30/90 Growth), all 403, and anonymous equivalents, all 401. The extra initial anonymous Growth request also returned 401. Live mutations were not attempted. Diagram APIs remain authenticated, owner-scoped product APIs; an admin role does not authorize opening every user's diagram.

## Genuine data and performance

The repository audit used a **read-only, repeatable-read production transaction**, without the service audit writer. Independent SELECTs matched total/new accounts, AI runs, Feed events, server Runs and server Submits in each range. Daily registrations sum to new accounts. Actual user/detail, problem/detail and audit payloads passed their schemas; no PII payload was saved.

Snapshot around 06:37 UTC October 21:

| Stored metric | 7 UTC calendar days | 30 UTC calendar days | 90 UTC calendar days |
|---|---:|---:|---:|
| All registered accounts | 45 | 45 | 45 |
| New registrations | 20 | 42 | 44 |
| Recorded active accounts | 4 | 8 | 9 |
| Deliberately engaged accounts | 4 | 6 | 6 |
| Returning accounts | 2 | 2 | 1 |
| Active on ≥2 UTC dates | 2 | 2 | 3 |
| Persisted AI runs | 20 | 106 | 175 |
| Feed impressions | 55 | 55 | 55 |
| Legacy browser submissions | 4 | 4 | 4 |
| Server Runs / Submits | 3 / 12 | 3 / 12 | 3 / 12 |
| Stored official Accepted / provisional pass | 7 / 3 | 7 / 3 | 7 / 3 |
| Code Intelligence reports created | 6 | 6 | 6 |

These are observations of stored records, not new executions, independent recertification, or customer conversion claims. Repeats count as separate submissions. Feature account counts overlap. Existing database access weaknesses qualify analytics integrity.

The legacy DSA overview has two practice attempts, one independent learning outcome and one completed user/problem pair. Its metrics intentionally differ from execution submissions; merging these would invent equivalent judging semantics. Its registration windows are rolling 7/30 days; Growth uses UTC calendar days. Both scopes are labeled. Its activity source covers learning events, practice attempts and reviews only.

Growth now uses one SQL statement instead of five with repeated event aggregation. Three EXPLAIN (ANALYZE, BUFFERS) observations returned one aggregate row each, roughly 2–4 ms execution and 45–55 ms repository round trips. [Exact data, comparisons and query plans](../evidence/runs/2026-10-21/admin-audit/database-comparison.json). These are small-snapshot observations, not percentiles or load tests. No index was added without measured need. Existing owner/time indexes and deduplication constraints were reviewed; duplicate practice event IDs, Feed event IDs and execution owner/idempotency pairs were zero in this snapshot.

Client stale time remains 30 seconds with explicit refresh. Pagination is capped at 100; sorting is allowlisted and search parameterized. Broad legacy queries and unpaginated diagram lists need monitoring as data grows. No materialized counters or dependencies were added.

## Customer insights: definitions and gaps

- Registered = profile record; API status active is a compatibility value, not recent activity.
- Recorded active = persisted allowed learner action or Feed impression in window. Admin catalog edits and empty AI conversations excluded.
- Engaged = practice attempt, revision, execution job, persisted AI run, note/bookmark, or deliberate Feed open/save/share/ask. Content-open/VIEW alone excluded. Unique-account/day counts resist repeated events.
- Returning = registered before window, recorded activity within it; not a returning browser session.
- Repeat activity = at least two distinct UTC dates; not D1/D7/D30 signup-cohort retention.
- Country is unavailable: timezone is not location. Referrals/UTMs were not captured: auth provider is not acquisition source. Persisted learning events are not complete browsing journeys.
- Billed costs and complete token usage are unavailable. Run counts cannot substitute for invoices/provider-call counts. No new collection infrastructure added.

## Tests and production gates

[Verification results and commands](../evidence/runs/2026-10-21/admin-audit/verification.json).
[Growth screenshot](../evidence/screenshots/2026-10-21/admin-audit/growth-observed-counts-local-fixture.png) uses local fixture authentication and genuine aggregate snapshot responses; it is not a production Admin screenshot.

1. Database owner reviews/applies the scoped migration and addresses broader exposed-table findings: [exact security handoff](SUPABASE_SECURITY_HANDOFF.md). Nothing applied here.
2. A normal authorized Admin session captures current Growth 7/30/90 response bodies/request IDs and verifies every page against the running API. Public OpenAPI does not prove authorized success.
3. After separate rollout approval, release compatible backend/web changes, then repeat database comparisons, authorization, role/audit operations, refresh/errors and advisors.

Do not declare production ready for freeze until these gates close.
