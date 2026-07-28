# Read-only Admin Panel backend

The Admin Panel API is mounted at `/api/v1/admin`. It uses the normal Supabase bearer-token
authentication path and then loads active role grants from PostgreSQL. A client-provided role or
JWT custom-role claim is never used for authorization.

## Granting access

The user must sign in once so a `profiles` row exists. Then run:

```bash
make grant-admin PROFILE_ID=00000000-0000-0000-0000-000000000000
```

This invokes the idempotent `grant_role` command and writes an active grant for the seeded `admin`
role. Revoked grants do not authorize access. Missing/invalid bearer authentication returns 401;
an authenticated user without an active admin grant receives 403.

## Endpoints

- `GET /api/v1/admin/overview`
- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/{user_id}`
- `GET /api/v1/admin/users/{user_id}/activity`
- `GET /api/v1/admin/problems/analytics`
- `GET /api/v1/admin/problems/{problem_id}/analytics`
- `GET /api/v1/admin/audit-logs`

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "http://localhost:8080/api/v1/admin/users?page=1&page_size=25&sort_by=created_at&sort_order=desc"
```

The interactive OpenAPI document at `/docs` lists all filters, sort allowlists, validation limits,
descriptions, and response schemas.

Supported user sort fields are `created_at`, `last_active_at`,
`unique_problems_completed`, `unique_problems_attempted`, `name`, and `email`. `current_streak`
sorting is intentionally rejected because the product has no approved streak formula. Both current
and longest streak values remain `null`.

Problem difficulty values are returned in this stable order: `beginner`, `easy`, `medium`, `hard`,
and `expert`. User detail includes every value even when its counts are zero.

## Metric definitions

- A DSA problem is a `content_items` row whose type is `problem`.
- The attempt system records learning outcomes rather than judge statuses. The existing business
  mapping advances `solved_independently` to `confident`; this is the accepted/completed outcome.
  `solved_with_hint` remains an attempt.
- A completion is a distinct `(user_id, content_item_id)` with at least one accepted outcome.
  Reattempts never increase unique completion totals.
- Completion/solve rate is unique completed pairs divided by unique attempted pairs/users. A zero
  denominator produces `0.0`.
- First-attempt success means the earliest attempt ordered by `attempted_at`, then immutable attempt
  ID, was accepted.
- Average attempts before completion includes only users who completed and counts through their
  first accepted attempt.
- Interview eligibility is true at 100 unique completed problems. It is informational only.
- Active-user timestamps use the greatest available timestamp from `activity_events.occurred_at`,
  `practice_attempts.attempted_at`, and `review_history.reviewed_at`.
- No official readiness or streak formula exists, so those values are `null`.
- Solve-time data and hint-usage analytics do not yet have approved semantics, so they are `null`.

Activity classification is deterministic:

- the first nonaccepted problem attempt is `problem_attempted`;
- later nonaccepted attempts are `problem_reattempted`;
- any accepted attempt is `problem_completed`, including an accepted reattempt;
- persisted review history is `revision_completed`;
- the profile creation timestamp is `user_signed_up`.

Activity is newest first. Signup events have no problem, and analytics never invent events from
derived progress state.

Revision data is available from `review_cards` and `review_history`. No mock-test persistence module
exists, so mock-test summaries return `available: false`.

## Email projection and privacy

Supabase Auth remains the email source of truth. Migration `20260728_0015` creates a private,
application-owned `profiles.email` projection, backfills it, and projects email during profile
insertion. Migration `20260728_0016` adds an `auth.users` email-update trigger so later changes,
including changes to `null`, remain synchronized and lowercased. Both migrations detect the Auth
schema conditionally, so non-Supabase adapters remain valid. Such adapters should populate the
nullable projection during profile provisioning.

Admin responses never include passwords, tokens, provider metadata, submitted source code, hidden
solutions, test-case answers, or authorization headers. Audit metadata is allowlisted.

Each successful analytics read writes a sanitized audit record after the read result has been
selected. Consequently, `GET /audit-logs` does not include its own audit row in that same response;
the row appears on the next request. Audit failures are logged internally and do not fail a
successful read. The only nonempty metadata currently approved is user-list pagination
(`page` and `page_size`).

## Migration, indexes, and tests

```bash
make migrate
make test
RUN_INTEGRATION_TESTS=1 make test
```

The migration adds `admin_audit_logs`, a partial unique lower-case profile-email index, analytics
indexes on `(content_item_id, user_id, attempted_at)` and `outcome`, and audit lookup indexes. It
does not add stored counters, views, materialized views, or duplicate progress tables.

The user list computes activity and completion aggregates with grouped CTEs and joins rather than
per-profile correlated subqueries. Queries remain live aggregates with allowlisted sort fragments
and parameterized user input. This first version has no materialized views or stored counters;
overview, broad unfiltered user lists, and problem analytics will eventually need query-plan and
latency monitoring as the attempt table grows.

The indexes in migration `0015` use normal transactional Alembic DDL, matching the repository's
established migration style. Creating the two indexes on an already large `practice_attempts` table
can briefly block writes; schedule that migration during a low-write window. They are deliberately
not created concurrently inside the normal migration transaction.
