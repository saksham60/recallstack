# Platform Intelligence Admin MVP

The admin homepage now renders cross-surface growth and engagement metrics via
`GET /api/v1/admin/growth?days=7|30|90`. Authentication uses the existing
server-enforced active admin role; reads are logged through the existing admin
audit pipeline. No public analytics endpoint or service-role key is added.

## Metric meanings

- **Total/New accounts**: rows in `profiles`, with UTC calendar-day windows.
- **Tracked engaged users**: unique accounts with at least one recorded DSA
  content open/code submission, a ReasonAI conversation or run (DSA or System
  Design), or a Knowledge Feed event in the selected window.
- **New accounts engaged**: tracked engaged accounts created in the window.
- **Recorded activation rate**: new accounts engaged / new accounts. This is
  *not* first-session conversion or verified retention.
- **Feature adoption**: distinct participating users per listed persisted
  surface; a user can be counted on multiple surfaces.
- **AI runs/error runs**: persisted `reasonai_runs` started in the window and
  rows marked failed/error or carrying an error code.
- **Knowledge Feed events**: event rows, not unique readers.
- **DSA code submissions**: persisted practice submission rows, not accepted
  judged solutions.
- **Unknown signup source**: all historical period signups; the existing schema
  does not store first-touch referrer/UTM attribution.

The dashboard intentionally cannot claim page visits, traffic geography,
conversion from anonymous visitor to signup, session length, mobile-only
activity, canvas-only use, DAU/WAU/MAU across all surfaces, cohort retention,
or cost per user. Those would be misleading without matching instrumentation.

## Next phase: capture acquisition safely

Capture the allowlisted first-touch referrer **hostname**, landing path, and
UTM source/medium/campaign in the web app before OAuth starts; avoid full
referrer URL (query params can contain personal information), IP addresses
and fingerprinting. On completed signup, send a bounded payload to an
authenticated server-owned endpoint. Store once per newly-created profile
in a private, access-controlled table after validating hostnames, length,
ownership, and signup recency. Label unknown/missing referrers as unknown,
not direct. Include platform='web'|'mobile'; mobile referrals/deep links need
separate integration. Use privacy notices and retention policies.

Once instrumentation exists, add source and campaign breakdowns, geographic
aggregates where legitimately available, 1/7/30-day return cohorts, and
account-level feature timelines with well-scoped access, excluding private
prompt/source-code content from analytics. Do not backfill unobserved origin.

## Review and rollout

- API `AdminUserDependency` must remain mandatory; non-admins receive 403.
- Keep the original DSA overview available at `/admin/dsa`.
- Build the backend and generate the typed OpenAPI client from the checked-out
  backend when integrating, replacing the temporary explicit authenticated
  request. Run backend tests, web typecheck/lint, E2E admin tests, and verify
  the API and dashboard in a preview before promoting to production.
- Database advisers currently flag public legacy tables with RLS disabled.
  Review and apply role-scoped policies separately: blindly toggling RLS on
  those tables could break app behavior.
