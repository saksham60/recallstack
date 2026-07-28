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

Revision data is available from `review_cards` and `review_history`. No mock-test persistence module
exists, so mock-test summaries return `available: false`.

## Email projection and privacy

Supabase Auth remains the email source of truth. Migration `20260728_0015` creates a private,
application-owned `profiles.email` projection, backfills it when `auth.users.email` is available,
and installs an insert projection trigger in Supabase deployments. Non-Supabase identity adapters
should populate this nullable column when provisioning profiles.

Admin responses never include passwords, tokens, provider metadata, submitted source code, hidden
solutions, test-case answers, or authorization headers. Audit metadata is allowlisted.

## Migration, indexes, and tests

```bash
make migrate
make test
RUN_INTEGRATION_TESTS=1 make test
```

The migration adds `admin_audit_logs`, a partial unique lower-case profile-email index, analytics
indexes on `(content_item_id, user_id, attempted_at)` and `outcome`, and audit lookup indexes. It
does not add stored counters, views, materialized views, or duplicate progress tables.
