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
`{items:[{problemVersionId,slug,name}]}` from reviewed, learner-visible associations.
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

Draft storage keeps its original account/problem/version/language key, so URL
migration never rebinds a saved solution to a different version.
