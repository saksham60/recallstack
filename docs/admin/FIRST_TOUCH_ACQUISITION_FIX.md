# First-touch acquisition fix — October 23, 2026

Acceptance URL: `/?utm_source=devpost&utm_medium=referral&utm_campaign=hackathon`.
Expected new-account attribution: **devpost / referral / hackathon**.

The previous provider captured after hydration, treated any stored object as final,
and deleted the capture when queuing rather than acknowledging delivery. Empty
placeholders could suppress genuine campaign data. Queue timers also stayed set
after identity changes, preventing a restored queue from scheduling promptly.

The synchronous Next.js client instrumentation now captures validated campaign
tags before hydration and authentication. A provider fallback captures before
identity setup on route changes. Session storage survives same-origin login and
same-tab Google OAuth round trips. Only empty, malformed or same-site placeholders
can be upgraded; an observed valid source stays immutable. A different later
campaign is kept separately in session storage and is never merged into signup
attribution. Auth-provider domains and same-site navigation are excluded as sources.

Each account's pending first-touch event has a persisted UUID. Refresh, auth
callbacks, lost responses and repeated logins reuse that UUID until acknowledgement;
the receipt then suppresses further emission in the tab. First touch survives
transient retry exhaustion and optional-event buffer pressure. HTTP retries remain
possible; the existing event-ID key and one-acquisition-per-user constraint make
storage idempotent. No new database constraint or migration was needed.

Client eligibility uses available Supabase creation/sign-in timestamps as a hint,
without relying on the browser clock. The authenticated backend still decides
eligibility using canonical profile creation within 24 hours. Ingestion now uses
the database clock for eligibility, receipt timestamps and effective-time clamping,
so API-host clock skew cannot reject a just-created profile. No old users are
assigned new signup sources, and no historical attribution is invented.

Admin User 360 presents Source, Medium and Campaign explicitly, plus captured
referrer, referral code and landing feature. Unavailable fields remain Unknown.

## Verification

- Client acquisition/delivery/privacy tests: **20 passed**.
- Browser acquisition suite: **4 passed** in one complete final run. It covers
  absent, empty and corrupt initial storage; landing/login refreshes; Google OAuth
  consent and PKCE callback; signup; real ingestion and PostgreSQL persistence;
  Admin rendering; a lost response after commit; refresh recovery; a later campaign;
  and repeat login without a duplicate stored first-touch event.
- Backend Product Intelligence integration and telemetry contract suites:
  **28 passed**. These include source/medium/campaign projection, duplicate receipt,
  first-touch immutability, old-account exclusion, privacy and permissions.
- TypeScript, scoped ESLint, Ruff and ingestion mypy checks: **passed**.
- Next.js production build: **passed**, including TypeScript and prerendering.

[Verification manifest](../evidence/runs/2026-10-23/acquisition/verification.json).

Browser tests use the real Supabase SDK, PKCE verification, callback route and
session cookies against a loopback-only Auth transport fixture and disposable
PostgreSQL with the existing migration. Google and hosted Supabase Auth are
simulated; this is not a production-provider login certification. The legacy user
profile envelope is fixture-supplied; acquisition persistence and modern Admin
analytics responses are real. No production account or attribution was created.

The first cold browser attempt exceeded its compilation allowance. The complete
rerun passed after increasing that allowance. A storage-mock descriptor was also
corrected before the final complete 20-test client run. Intermediate clock tests
exposed and verified the ingestion timestamp correction described above.

[Admin fixture screenshot](../evidence/screenshots/2026-10-23/acquisition/devpost-fixture.png).

Run with Node 22+ and Docker:

```powershell
cd web
npm run test:acquisition
npm run typecheck

cd ../backend
$env:RUN_INTEGRATION_TESTS='1'
uv run pytest tests/integration/test_product_intelligence.py tests/unit/test_telemetry_contract.py -q
```

All changes remain local. No push, deployment, database migration, historical
backfill, production data mutation, or paid provider call was performed for this fix.
