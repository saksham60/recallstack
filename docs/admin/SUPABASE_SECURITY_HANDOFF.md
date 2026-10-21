# Admin access: database owner handoff

Candidate only, **not applied in production**. Project: `jlqawpdsyptfxspyqnsu`.

## P0 finding

Production metadata on October 21, 2026 shows `public.roles`,
`public.profile_role_grants` and `public.admin_audit_logs` have RLS disabled and
anonymous/authenticated SELECT and write privileges. This permits a direct Data
API path around the backend's otherwise correct administrator check. No role
escalation, unauthorized user-row read, or production mutation was attempted.

Anonymous HEAD probes with `limit=0` returned 200 for all three Data API tables.
No response body or row was read. [Probe evidence](../evidence/runs/2026-10-21/admin-audit/anonymous-metadata-probe.json).

[Recorded metadata](../evidence/runs/2026-10-21/admin-audit/security.json) contains
the exact grants, policy dependencies and sequence names. No production policy
referenced these role/audit tables, and no public/private application function
referenced `profile_role_grants` or `admin_audit_logs` in the inspected definitions.
Browser/mobile role access uses the authenticated backend, not direct table queries.

## Candidate migration

Review [20261021061454_admin_role_and_audit_access.sql](../../web/supabase/migrations/20261021061454_admin_role_and_audit_access.sql).
It enables RLS on these three tables, revokes browser/PUBLIC table and sequence
access, and preserves server owner/service-role operations. It adds no client
policy based on JWT metadata, no SECURITY DEFINER function, and changes no rows.

The Docker PostgreSQL test applies the actual migration and verifies:

- anonymous and authenticated SELECT/DELETE fail on all three tables;
- existing role, grant and audit records remain unchanged;
- service-role audit insertion still works, including sequence privileges;
- the backend's separate grant/revoke workflow and final-admin safeguard tests pass.

Before applying, the owner must confirm the deployed backend's connection role
owns these tables, bypasses RLS, or has a deliberately scoped server policy. The
current connection configuration uses the PostgreSQL server account; do not give
browser roles server permissions to resolve a deployment mismatch. Also check
for any independently deployed consumers not represented in this repository.

After approval, apply once using the normal Supabase migration workflow, then
repeat normal admin login, role lookup, safe grant/revoke on a designated test
account, sanitized audit read/write, ordinary-user 403 and anonymous 401. Confirm
Data API denial without reading user records. No blanket rollback that restores
anonymous role writes is safe; resolve a consumer mismatch with a server role.

## Broader unresolved exposure

The production advisor reports **38 public tables with RLS disabled**, and the
metadata check finds anonymous write grants on all 38. The candidate covers three;
the other 35 require a consumer/permission review. Examples include practice
attempts, bookmarks, notes, review history and progress. These can affect both
privacy and analytics integrity. The full table list is in the evidence JSON.

Do not blindly add ownership policies to global catalog tables or revoke access
from browser-owned tables. Review each table's actual server/browser consumers,
existing RPC execution grants and data ownership, prepare a separate tested
migration, and repeat product workflows. This broader P0 issue remains a release
gate. The current audit does not claim a clean production security advisor.

Other advisor groups include mutable function search paths and executable
definer functions. Trigger-returning functions cannot automatically be treated
as callable data RPCs; inspect signatures and grants before declaring exploitation.
Private execution tables with RLS and no client policy are intentionally service-only.

Supabase guidance: [securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
