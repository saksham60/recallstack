# DSA API contract

The DSA API is registered at `/api/v1/dsa` in the existing FastAPI application.
React and Flutter use the same JSON contracts and Supabase bearer authentication.
There are 18 operations across 14 paths. No execution, judging or tutoring API is provided.

## Endpoint inventory

| Method | Path relative to `/api/v1/dsa` | Authentication | Response |
|---|---|---|---|
| GET | `/problems` | Public; preview requires admin/reviewer | Catalog cursor page |
| GET | `/problems/{problem_id}` | Public; preview requires admin/reviewer | Problem detail |
| GET | `/problems/{problem_id}/test-cases` | Public; preview requires admin/reviewer | Verified public test cursor page |
| GET | `/categories` | Public; preview requires admin/reviewer | Taxonomy with visible counts |
| GET | `/topics` | Public; preview requires admin/reviewer | Taxonomy with visible counts |
| GET | `/capabilities` | Public | Features and separate language lists |
| GET | `/me/progress` | Bearer | Existing progress page |
| GET | `/me/problems/{problem_id}/progress` | Bearer | Progress with row version |
| PATCH | `/me/problems/{problem_id}/progress` | Bearer | Updated progress and sync cursor |
| GET | `/me/bookmarks` | Bearer | Existing bookmark page |
| POST | `/me/bookmarks` | Bearer | `changed`, `sync_cursor` |
| DELETE | `/me/bookmarks/{problem_id}` | Bearer | 204 |
| GET | `/me/problems/{problem_id}/notes` | Bearer | Existing note page |
| POST | `/me/problems/{problem_id}/notes` | Bearer | Created note, 201 |
| PATCH | `/me/notes/{note_id}` | Bearer | Updated note |
| DELETE | `/me/notes/{note_id}` | Bearer | 204 |
| GET | `/me/practice-history` | Bearer | Attempt cursor page |
| GET | `/me/statistics` | Bearer | Precisely defined counts |

## Identity and versions

`problem_id` and catalog/detail `id` always mean `content_items.id`. They never mean a
definition, practice resource, suite or specification version ID. Existing learning DTOs
retain their field name `content_item_id` with exactly the same identity.

`problem_version_id` means `dsa_problem_versions.id`. Clients should pass the ID received
from details to `/test-cases?problem_version_id=...` so publication changes cannot silently
switch their tests. If that version ceases to be the current eligible version, ordinary
clients receive 404 and should refresh details. There is no fallback to another version.

Learner specifications require all of:

1. An active `dsa` domain, problem content type, and non-archived content item.
2. Its owned current base content version is published and has a publication timestamp.
3. A DSA definition belongs to that content item and points to the selected DSA version.
4. That DSA version belongs to the definition and has status `published`.
5. `provenance.quality_review_20261015.publish_approved` is the JSON boolean `true`.

Missing approval metadata, a string `"true"`, `verified` status, reviewed flags and a published
base content item alone do not grant access. The metadata path is the existing imported
review contract; future editorial metadata formats must be mapped deliberately. No flags,
pointers or records are changed by this API.

`preview=true` is explicit on the catalog, detail, fixtures and taxonomy routes. It requires
a valid token with the existing database-resolved `admin` or `reviewer` role. A content editor
alone cannot preview. Details and fixtures optionally accept `problem_version_id`; ownership
is checked through the requested content item. Without that ID, preview selects the latest
non-published version, ordered by version number, creation timestamp and version UUID descending;
if no draft exists it selects the latest published version in that order. Multiple definitions
for one content item still produce one catalog item. Archived items and inactive domains are
excluded even from preview. Preview does not reveal internal metadata or hidden cases.

`availability` values:

- `available`: the selected version satisfies the ordinary learner eligibility rules.
- `review_pending`: authorized preview selected a version that is not currently learner eligible.
- `unavailable`: reserved for clients describing unavailable resources; protected/missing
  details currently return 404, rather than disclose draft existence in a response object.

The imported 375 version-2 specifications are still unapproved with null definition pointers.
An empty public catalog and 404 for their details are expected until an independent approval
workflow publishes them. Existing published base-content learning features remain usable:
learner progress, bookmarks and notes do not require an executable or approved DSA specification.

## Catalog and detail schemas

Catalog filters: `search` (title substring, trimmed and case-insensitive, max 200 characters),
`difficulty` (existing enum including beginner/easy/medium/hard/expert), `category` and `topic`
(UUIDs), `sort=title_asc`, `limit`, `cursor`, and `preview=false`.
`%` and `_` in search are literal characters. Unknown category/topic IDs yield no matches.

```json
{"items":[],"next_cursor":null,"has_more":false}
```

Each item contains `id`, `problem_version_id`, `slug`, `title`, nullable `difficulty`,
`categories`, `topics`, and `availability`. Taxonomy entries contain `id`, `slug`, `name`.
No list query retrieves the full specification or private provenance.

Details add `description`, `function_contract`, `constraints` (strings), `examples` and
`supported_contract_languages`. `function_contract` exposes only explicitly named public
signature, input/output, representation, serialization and contract-semantics fields. Internal
implementation/compilation/checker-review fields are excluded. Missing contract fields are
omitted. An input or output contract can be a string or a parameter-to-type-description map.
Examples contain `input` and `output` JSON and an optional explanation. Metadata keys are
removed recursively from public JSON. Missing constraints, examples, taxonomy and explicit
language metadata become empty collections; no inferred mappings or execution languages appear.

## Public fixture selection

The selected problem version must first be authorized using the same rules as details.
The highest suite version for that exact problem version is selected deterministically.
It must have status `published`. If the latest suite is unapproved, an older approved suite
is not substituted. Preview also requires a published suite to return fixtures.

Only `visibility=public AND validation_status=verified` cases with inline input JSON are
projected. External fixture references are never dereferenced or returned. Hidden, pending
and rejected data and oracle metadata are excluded in SQL. `expected_output_json` may be
JSON null. Fixtures are ordered by ordinal and UUID ascending and paginated with the same
20/50 limits. The API never converts statement examples into fixtures.

```json
{
  "problem_version_id":"00000000-0000-0000-0000-000000000002",
  "items":[],
  "has_verified_public_tests":false,
  "next_cursor":null,
  "has_more":false
}
```

An item has `id`, `input_json`, `expected_output_json`. The boolean reports whether this
returned page contains verified public cases. An unauthorized problem remains a 404;
an authorized version without an approved suite or verified inline public cases returns 200
with an empty collection. All imported version-2 cases remain pending/rejected at implementation.

## Pagination and taxonomy

Catalog, practice history and fixtures default to 20 items and permit 1–50. They use keyset
pagination with one extra row to determine `has_more`; no total count or offset scan is used.
Catalog ordering is database `lower(btrim(title)) ASC, content_item_id ASC`. Practice history
ordering is `attempted_at DESC, attempt_id DESC`.

Cursors are URL-safe base64 JSON containing format version `v=1`, a SHA-256 fingerprint of
normalized filters/sort/preview context, and the two ordering values. History additionally
binds the authenticated profile and normalized date bounds; fixture cursors bind the problem
and selected version. Invalid cursors and incompatible-filter reuse return 422. Page size can
change between requests. Cursors are opaque positioning tokens, not signed authorization
credentials: every query reapplies visibility and ownership independently. They are not
snapshots; concurrent edits to titles or timestamps can move records between pages.

Progress, bookmarks and notes retain the existing learner pagination envelope:
`pagination: {page,page_size,total_items,total_pages}`. Their DSA wrappers bound page to 1–1000
and page_size to 1–50, defaulting to 20. Filtering is performed in SQL before pagination.

Categories/topics return `items` with `id`, `slug`, `name`, `problem_count`. They use existing
DSA-domain metadata and version-owned mappings; counts are distinct caller-visible problems.
Categories with zero visible problems can appear. No topics or relationships are invented.

## Learner writes and synchronization

All `/me` identity comes from the existing authenticated profile. There is no accepted user-ID
field. Existing `LearningService` and its repository write methods own every mutation. The
DSA adapter only adds domain scoping and filtered list reads. Existing generic APIs retain
their routes, schemas and behavior.

Progress PATCH requires `row_version >= 0` and at least one non-null `status` or `confidence`.
Omitted values remain unchanged. The existing statuses and transitions apply: `new`, `learning`,
`attempted`, `confident`, `mastered`; confidence is 0–100. Creation uses row_version 0. Stale
writes return 409, invalid transitions 422. Successful responses include the new row_version
and sync_cursor. A missing state reads as `new`, confidence 0 and row_version 0 through the
existing single-item service, but statistics do not manufacture progress rows for it.

Bookmark POST accepts `{"problem_id":"<content-item-uuid>"}`. Repeated POST returns
`changed=false` without adding activity or sync entries. DELETE returns 204 even if the
bookmark was already absent for a valid DSA problem. Changed deletes include `X-Sync-Cursor`.

Note POST accepts `kind` (`note`, `mistake`, `insight`), optional nullable `title` (max 240),
and `body` (nonblank, max 100000). Multiple notes are supported. Note PATCH requires
row_version >= 1 and changed fields; title can be explicitly null. Body and kind cannot
be null. Note DELETE accepts `{"row_version":1}` in its JSON body, matching the existing
API convention. It soft-deletes the owned note and returns 204 with `X-Row-Version` and
`X-Sync-Cursor`. Stale versions return 409; missing, deleted, another owner's, or another
domain's notes return 404. No bulk problem-level note replacement or deletion is provided.

Activity recording, user sync counters, user sync change logs, transactional rollback,
soft deletion and existing note ordering remain learning-owned. Writes to shared tables
are never reimplemented by a new DSA persistence path.

## History, statistics and language support

History accepts aware `start_at` inclusive and `end_at` exclusive. Bounds are normalized to
UTC; naive timestamps and end_at <= start_at return 422. Items retain attempt `id`, canonical
`content_item_id`, UTC `attempted_at`, stored `outcome`, duration, hint use and confidence fields.
There is no submission API in this module; existing practice attempts are authoritative.

Statistics count only the caller's DSA-domain problem records:

| Field | Definition |
|---|---|
| total_catalog_problems | Currently learner-visible approved DSA catalog items |
| attempted_problem_count | Distinct content items in recorded attempts |
| practice_attempt_count | All recorded DSA attempts |
| learning_status_counts | Stored progress records per existing status; zero for absent statuses |
| mastered_problem_count | Stored progress records with mastered status |
| self_reported_solved_attempt_count | Attempts with solved_independently or solved_with_hint |

Historical attempts/progress still count if a problem later becomes archived/unavailable.
They are not restricted to the current approved specification catalog. There is no inference
of judge success, and an uninitialized user has zero recorded progress/attempt counts.

Capabilities return catalog/progress/bookmarks/notes/practice_history=true and
sandbox_execution/ai_tutoring=false. `published_contract_languages` comes only from explicit
supported_languages arrays on currently approved specifications. `configured_runtime_languages`
comes from enabled runtime records. `execution_languages` is always empty. Neither Python
reference code nor configured runtime rows makes execution available.

## Errors, caching and operation

Errors use the existing `application/problem+json` envelope: type, title, status, detail,
instance and request_id. The existing request-ID tracing middleware remains active.
401 means missing/invalid authentication, 403 a disallowed preview role, 404 an inaccessible
resource, 409 stale learner state, 422 invalid input/cursor/transition, and 503 database
unavailability or timeout. Private SQL and dependency error messages are not returned.
Unexpected errors retain the existing generic 500 response.
The existing CORS origin rules are retained; browser clients can read `X-Sync-Cursor`,
`X-Row-Version` and `X-Request-ID` response headers.

Every DSA response, including handled errors, uses `Cache-Control: private, no-store` and
`Vary: Authorization`. This conservative initial contract prevents stale publication gates
and cross-user/preview cache leaks without adding infrastructure. There is no shared CDN
caching or ETag promise in this version.

The existing process-wide SQLAlchemy pool is reused. Reads use request-scoped, read-only
transactions; DSA statements have a 5-second database timeout and complete handlers have a
10-second timeout. Cancellation is propagated and sessions are closed/rolled back. No new
engine, service, environment setting or startup schema-reconciliation task exists.

The five read mappings use separate metadata for the externally managed DSA tables. They
are not added to the existing Alembic autogeneration target. Production already has those
tables; this change supplies no migration and applies no DDL there. DSA PostgreSQL tests
create a separate disposable database, run existing migrations, then create matching DSA
types/constraints/relationships and the existing suite visibility index. Their schema and
seed data cannot affect existing backend test databases. A fresh development database built
only from existing Alembic migrations still needs an explicitly provisioned DSA schema to
serve catalog queries; missing tables produce 503. Never run test schema setup on production.

## Examples

Replace UUID and token placeholders with real values. Draft content requires preview.

```sh
curl 'http://localhost:8080/api/v1/dsa/problems?limit=20&sort=title_asc'
curl 'http://localhost:8080/api/v1/dsa/problems?preview=true&limit=20' \
  -H 'Authorization: Bearer <reviewer-access-token>'
curl 'http://localhost:8080/api/v1/dsa/problems/<problem-id>?preview=true&problem_version_id=<version-id>' \
  -H 'Authorization: Bearer <reviewer-access-token>'
curl 'http://localhost:8080/api/v1/dsa/problems/<problem-id>/test-cases?problem_version_id=<version-id>'
curl -X PATCH 'http://localhost:8080/api/v1/dsa/me/problems/<problem-id>/progress' \
  -H 'Authorization: Bearer <access-token>' -H 'Content-Type: application/json' \
  -d '{"row_version":0,"status":"learning","confidence":25}'
curl -X POST 'http://localhost:8080/api/v1/dsa/me/bookmarks' \
  -H 'Authorization: Bearer <access-token>' -H 'Content-Type: application/json' \
  -d '{"problem_id":"<problem-id>"}'
curl -X POST 'http://localhost:8080/api/v1/dsa/me/problems/<problem-id>/notes' \
  -H 'Authorization: Bearer <access-token>' -H 'Content-Type: application/json' \
  -d '{"kind":"insight","body":"Track the invariant."}'
curl -X PATCH 'http://localhost:8080/api/v1/dsa/me/notes/<note-id>' \
  -H 'Authorization: Bearer <access-token>' -H 'Content-Type: application/json' \
  -d '{"row_version":1,"body":"Updated invariant."}'
curl -X DELETE 'http://localhost:8080/api/v1/dsa/me/notes/<note-id>' \
  -H 'Authorization: Bearer <access-token>' -H 'Content-Type: application/json' \
  -d '{"row_version":2}'
curl 'http://localhost:8080/api/v1/dsa/me/practice-history?start_at=2026-10-01T00%3A00%3A00Z&end_at=2026-11-01T00%3A00%3A00Z' \
  -H 'Authorization: Bearer <access-token>'
curl 'http://localhost:8080/api/v1/dsa/me/statistics' -H 'Authorization: Bearer <access-token>'
```

## OpenAPI and verification

The application-generated `/openapi.json` documents every registered operation and Pydantic
schema. `docs/dsa-openapi.json` is a portable DSA-only snapshot of that generated contract.
See [verification results and exact commands](dsa-verification.md).

Excluded work: production editorial approval, sandbox execution, submission judging,
AI tutoring, React UI and Flutter UI. These capabilities are not represented as operational.
