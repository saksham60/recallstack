# Supabase V3 handoff

Owner: separate Supabase workstream (user confirmed 2026-10-16). Status: proposed,
NOT applied to production. Reviewed source/reference/company metadata is pending.

## Checkpoint 1 migration

Review `web/supabase/migrations/20261016084605_dsa_v3_personal_boards_companies.sql`
(generated with `supabase migration new`). It adds:

- `public.dsa_personal_boards`: `(user_id, category_id)` primary key, JSON layout
  schema 1, positive monotonic `row_version`, server timestamp, owner CRUD RLS.
  A revision trigger prohibits owner/category reassignment and skipped revisions.
  Web PUT performs compare-and-swap; conflicting first inserts/updates return 409.
- `public.dsa_companies`: normalized unique slug/name. Authenticated read only.
- `public.dsa_problem_company_tags`: exact-version association, default unreviewed,
  reviewer/time/source required before a reviewed tag is visible. Review/source
  columns are not granted to learners. Public web API returns only version/name/slug.
- `dsa_v3_private.visible_version(uuid)`: narrowly scoped boolean RLS helper,
  fixed empty search path, explicit signed-in check, publication/current-pointer/
  DSA-domain checks. SECURITY DEFINER is used only to avoid granting raw private
  specification/oracle JSON to learners. Keep this schema OUT of exposed schemas.

No publication/certification flags, fixtures, content IDs or existing learner rows
are modified. There is no fabricated company seed data. Missing storage returns
503; the board remains browsable, with persistence visibly unavailable.

## Owner acceptance checklist

1. Compare migration identifiers/schema with installed production history.
2. Review grants, RLS, helper ownership and search path; run Supabase advisors.
3. Apply in staging; exercise owner CRUD, foreign-owner denial, stale revisions,
   unpublished association denial and anon denial. Confirm PostgREST relationships
   for `company:dsa_companies!inner(slug,name)` and refresh schema cache if needed.
4. Load ONLY reviewed company metadata with exact immutable version IDs and evidence.
5. Return installed migration version, environment and test results. Then coordinate
   production application. Codex has not applied the proposed migration.

## Later checkpoints — contract design still pending

Versioned public adapters/templates/checker descriptions (never private expectations),
private certification evidence/revocation ledger, immutable suite revision hashes,
submission history projection, durable deduplicated report generation, report rubric/
model/harness/checker revisions, per-user limits/global leases and skill history.
Do not invent these schemas independently: align the reviewed owner handoff with
the shared harness before implementing production persistence.

## Local verification

`backend/tests/dsa/test_v3_storage.py` applies this exact SQL only in a randomly named
disposable loopback database. Tests check CAS, foreign-owner reads/writes/deletes,
owner reassignment, metadata publication filtering and private-column denial.
This is local migration evidence, not evidence of an installed production schema.
