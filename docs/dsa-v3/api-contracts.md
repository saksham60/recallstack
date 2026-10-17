# DSA V3 API contracts

Existing API operations retain their request/response compatibility.

## Read-only FastAPI additions (no new database schema)

- `GET /api/v1/dsa/resolve?problem=<slug-or-uuid>&problem_version_id=<optional-uuid>&preview=false`.
  Returns existing `ProblemItem` DTO, never the specification/oracle. Uses the SAME
  publication and exact-version selection as detail. Missing/inaccessible 404;
  malformed parameters 422; preview requires verified reviewer/admin authorization.
- `GET /api/v1/dsa/me/topic-progress`: verified identity required. Returns
  `{items:[{id:<category-uuid>,attempted_count,mastered_count}]}`. Counts distinct
  visible canonical problems for that user. Attempted includes attempted/confident/
  mastered self-assessments. Accepted does not modify mastery.

Deploy the backend additions before the web canonical routes. Generated OpenAPI
TypeScript types include both operations. Server route resolution uses the existing
API origin; optional server-only `DSA_API_BASE_URL` selects the same API in isolated
test environments. It is never set from a request query/header.

## Authenticated Next additions (schema-owner handoff required)

All check verified Supabase identity and Origin. Responses private/no-store.
No E2E auth bypass, no service key, and all reads/writes remain subject to RLS.

`GET /api/dsa/boards/<category-uuid>` returns:

```json
{"categoryId":"uuid","rowVersion":0,"layout":{"schema":1,"lanes":{"easy":[],"medium":[],"hard":[]},"collections":[]}}
```

Revision 0 means no saved row. `PUT` accepts ONLY `{rowVersion,layout}`. First write
inserts revision 1; subsequent writes compare the submitted revision and advance
by one. A collection is `{id:<uuid>,title:<1..80 chars>,problemIds:[<uuid>]}`.
Limits: 30 collections, 1000 distinct IDs per list, 64KiB request/layout. Saved
IDs are references; they NEVER alter canonical difficulty/category assignments.
Conflict 409, validation 422, missing schema/unavailable storage 503.

`POST /api/dsa/board-companies` accepts `{versions:[<uuid>]}` (1..1000). Returns
`{items:[{problemVersionId,slug,name,reviewStatus}]}` from existing learner-visible
canonical company associations. `reviewStatus` is reviewed or imported. Recognized
legacy parse states are explicitly imported; needs_review sources are excluded.
The server explicitly paginates metadata. Missing schema 503; absence of tags is
an empty result, not a fabricated company association. Reviewer preview currently
does not expose unreviewed company metadata or editable personal arrangements.

## Canonical URLs

- `/dsa`: topic home; legacy `?problem=<uuid>&version=<uuid>` resolves server-side
  and temporarily redirects to `/dsa/problem/<slug>?version=<uuid>`.
- `/dsa/<topicSlug>`: topic board; known UUID category links redirect to their slug.
- `/dsa/problem/<slug>?version=<uuid>&submission=<uuid>`: sole workspace. Omitted
  version resolves current published version. Submission GET verifies owner on the
  server and the UI additionally rejects mismatched problem/version IDs.
- `/dsa/library`: permanent redirect to `/dsa`.
- Generic `/content/<dsa-slug>` compatibility forwards to the sole workspace.

Legacy draft keys remain intact. Approved typed Python contracts use a separate
contract-revision suffix and retain the original draft for explicit copy/adaptation.
Non-Python legacy keys remain unchanged. URL migration never rebinds a draft.

## Versioned execution metadata

Existing `GET /api/dsa/execution-capabilities?problemId=&problemVersionId=` now
optionally includes `publicRun` and `approvedContract`. No new Submit endpoint.
`publicRun` contains the complete certified public case set, suite ID, public
revision, contract revision, shared harness SHA and typed/legacy Python contract.
The private submit plan is never serialized. At most 100 cases, no partial pages.

`approvedContract` is `{problemId,problemVersionId,contract,contractRevision,
sourceNotice}`. It comes from authenticated `dsa_v3_problem_contract` and can be
available before a hidden suite is certified. It provides typed starters and
provisional example/custom invocation without granting Submit eligibility.
Matching public Run receipts are a client UX gate only; the server independently
judges the exact source and checks registry, certificate and fixture revisions.

## Saved submissions and Code Intelligence (proposed owner migration required)

- `GET /api/dsa/submissions?problemId=<uuid>&problemVersionId=<uuid>`:
  `{items: SubmissionView[], next: {before, beforeId}|null}`. Optional paired
  `before` ISO timestamp and `beforeId` UUID select older rows. Page size 20,
  owner only, exact version, no source/plan/private fields. Existing Submit POST
  remains `/api/dsa/executions`; no second submission endpoint was introduced.
- `GET /api/dsa/submissions/<uuid>/report`: `{submissionId,sourceCode,codeSha256,
  enabled,report}`. Source is owner-only, read-only, from the durable submission;
  it never replaces the current editor draft.
  `report` is null until scheduled, otherwise has `id,status,model,rubric,attempts,
  createdAt,updatedAt` and optional `analysis/error`. States: queued, generating,
  completed, failed, rate_limited. Reads reuse persisted reports and cannot choose
  arbitrary source/model/rubric. Unknown/foreign submission returns 404.
- Both use real Supabase identity, same-origin checks, no-store responses and no
  development auth bypass. Missing proposed storage returns 503 with a recoverable
  UI state. The official judge result remains independently visible.
- Queue payload `{reportId:<uuid>}` contains no code, fixtures or credentials.
  The consumer claims a durable fenced row before any provider call.
