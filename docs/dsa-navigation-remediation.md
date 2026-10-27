# DSA navigation remediation — 27 October 2026

Implemented and verified locally. Nothing was deployed, no production data was changed, and unrelated working changes were preserved.

## Confirmed causes

1. `TopicPage` awaited an uncached server category request before rendering its board. The production-build baseline made three upstream category requests for Arrays → Graphs → Arrays, including a repeat Arrays visit.
2. Topic cards had no router pending feedback, and the topic route had no loading boundary. The cold baseline showed no visible response for 1,185.7 ms.
3. `useBoardProblems` returned only after every cursor page completed. This delayed first usable content by the entire pagination chain.
4. The existing DSA error boundary used `reset()`. In the installed Next.js 16.3.8, `reset()` does not refetch server content; a controlled server outage confirmed that its retry button could not recover. It now uses the supported `retry()` prop.

Progress, bookmarks, and personal-board queries were already independent. They were not confirmed as unconditional blockers. Restored filters could nevertheless display premature empty results while their optional metadata was pending; that behavior is corrected.

## Production API observations

Unauthenticated, read-only production requests found 16 public categories containing 375 category memberships. Arrays had 26 problems. Dynamic Programming had 54 and was the only category above the existing 50-item API page limit.

Three category reads took 383, 273, and 249 ms. Arrays' summary request took 331 ms. Dynamic Programming's two sequential pages took 548 and 298 ms. These are workstation-to-production HTTP timings, not database query timings or authenticated production navigation measurements. See [raw production API observations](dsa-navigation-public-baseline.json).

## Changes

- Cards use `useLinkStatus` in a descendant of `Link`; the framework owns pending state and cancellation. Feedback is immediate, occupies no additional layout space, and does not force a delay on completed navigation.
- A route-level `loading.tsx` renders a board-shaped skeleton. The same problem skeleton is used while the client fetches its first page. Shared navigation remains available. Skeletons use existing tokens and have no shimmer animation.
- Only unauthenticated public category reads use Next's shared fetch cache, with 60-second revalidation and the `dsa-public-categories` tag. Problem resolution and reviewer-preview reads remain `no-store`. A public cache miss for a category identifier performs a fresh authoritative lookup, allowing newly published slugs to resolve before revalidation.
- The problem query uses sequential `useInfiniteQuery` pages and renders page one immediately. Partial counts and empty states explicitly describe incomplete loading. Duplicate IDs, missing/cyclic cursors, and the existing catalog-size bound remain guarded.
- Arrangement and collection writes wait for a complete, valid problem catalog. Saved collection members that have not loaded are described as loading, rather than unavailable. Saved order is applied as records arrive. A later-page outage retains usable earlier problems and offers retry; integrity failures rebuild cursor history from page one.
- Optional progress, bookmarks, personal boards, and company metadata do not block unfiltered browsing. Company metadata retains its complete-catalog batch, avoiding repeated downloads of earlier tags as pages arrive. Saved filters report waiting/unavailable data rather than false empty results.
- No additional speculative problem prefetching, dependencies, database changes, or category registry were added.

## Measured comparison

Both navigation captures used a webpack production build served by `next start`, Chromium at its desktop viewport, a fresh browser context, a cold fixture category cache, 900 ms server-category delay, and 250 ms delay per problem page. The stress fixture contains 151 problems across four pages. Sequence: DSA → Arrays → DSA → Graphs → DSA → Arrays. Browser frame sampling observes visible pending UI, skeletons, route headings, and usable problem links. All times are milliseconds after the click.

| Metric | Before | After | Reduction |
|---|---:|---:|---:|
| Cold Arrays acknowledgment | 1,185.7 | 10.1 | 99.1% |
| Cold Arrays skeleton | 1,185.7 | 210.8 | 82.2% |
| Cold Arrays first usable problems | 2,398.0 | 1,364.1 | 43.1% |
| Cold Arrays complete problem data | 2,398.0 | 2,191.4 | 8.6% |
| Repeat Arrays first usable problems | 1,010.0 | 339.4 | 66.4% |
| Server category requests across three topic clicks | 3 | 1 | 66.7% |

Afterward, the new Graphs visit reused taxonomy and showed first usable problems in 598.4 ms, versus 2,061.7 ms before. All three after-run acknowledgments were between 1.5 and 10.1 ms. The cold skeleton itself took 210.8 ms, slightly above the 200 ms engineering goal; visible card feedback covered that interval from 10.1 ms onward.

These are individual controlled local observations, not production percentiles or a claim that deployed performance has changed. The actual public catalog currently needs at most two pages, so the four-page stress improvement is not representative of every topic. Both measured servers and browsers ran under Node 24.19.0 tooling; the initial baseline bundle was built using the host's Node 20.16.0, while the final build used Node 24.19.0 to meet the repository's Node >=22 requirement.

Raw captures: [before](dsa-navigation-before.json), [after](dsa-navigation-after.json).

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Production `next build --webpack` — passed, including the build's TypeScript checks.
- `npm run test:dsa-navigation` — passed: **35 tests, zero failed, zero skipped, zero flaky**, using `next start` with the development authentication bypass disabled.
- Visually inspected desktop route loading, mobile navigation, and problem skeletons with injected light tokens. The app currently ships dark tokens; the light test verifies token inheritance rather than claiming an existing light-theme switch.

The suite covers controlled slow server resolution, pending keyboard activation and pointer navigation, route skeleton visibility, progressive pages, saved filters, optional-service delays/outages, page errors and recovery, duplicate/cyclic cursors, 0/1/24/25/26/50/51/151-item catalogs, UUID canonical redirects, problem links, bookmarks, completion statuses, personal collections, pointer drag, keyboard ordering, write rollback, mobile width, reduced motion, and Chromium network throttling at 150 ms latency / 192 KiB/s download / 96 KiB/s upload.

Security checks cover anonymous endpoint rejection, rejection of the development bypass cookie by production middleware, preview credential forwarding, rejection of a non-reviewer preview, no shared preview cache, and no credentials on shared public category reads. Auth and catalog fixtures are loopback-only and are not imported by application code. Deployed RLS and authenticated production service timings were not exercised or changed.

Earlier verification exposed and corrected the server retry and pagination-recovery bugs. Tests were also updated to use visible/accessible controls because streamed hydration can temporarily retain hidden DOM copies. The anonymous API assertion now uses an isolated request context rather than the authenticated page's cookies. The final run is green.

### Reproduce

Use Node.js >=22 and run from `web`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
$env:DSA_NAVIGATION_CAPTURE = 'after'
npm.cmd run test:dsa-navigation
```

The runner prepares existing assets, removes only local fixture taxonomy cache entries, builds production assets, starts the loopback catalog/auth fixture and `next start`, measures before functional tests warm the cache, and runs the affected suites. It does not edit environment files. The test build intentionally embeds loopback public service URLs; rebuild with normal deployment environment values before any future deployment.

The default Turbopack build stalled during compilation in this Windows workspace and was stopped. Webpack production builds completed successfully; both before/after measurements use webpack. The application’s normal build script and compiler configuration were not changed. Existing Queue region warnings remained non-fatal.

## Files modified or added

| File | Purpose |
|---|---|
| `web/src/features/dsa/navigation/TopicHome.tsx` | Attach supported Link status |
| `web/src/features/dsa/navigation/TopicLinkStatus.tsx` | Router-owned, accessible card feedback |
| `web/src/features/dsa/navigation/TopicBoardSkeleton.tsx` | Shared route and problem skeletons |
| `web/src/features/dsa/navigation/TopicBoard.tsx` | Progressive UI, truthful filters, complete-catalog write guard |
| `web/src/features/dsa/navigation/api.ts` | Incremental query, pagination validation and recovery |
| `web/src/features/dsa/navigation/navigation.css` | Pending styles and token-based skeleton layout |
| `web/src/lib/dsa-execution/catalog-server.ts` | Public taxonomy cache and fresh identifier misses |
| `web/src/app/(app)/dsa/[topicSlug]/loading.tsx` | Route loading boundary |
| `web/src/app/(app)/dsa/error.tsx` | Refetching server retry |
| `web/e2e/dsa-navigation.spec.ts` | Production-compatible anonymous assertion and visible controls |
| `web/e2e/dsa-pagination.spec.ts` | Progressive pagination, corruption/recovery regressions |
| `web/e2e/dsa-navigation-loading.spec.ts` | Slow services, isolation, input, mobile and token coverage |
| `web/e2e/dsa-navigation-performance.spec.ts` | Cold/repeat frame timing and controlled performance assertions |
| `web/scripts/e2e-dsa-catalog.mjs` | Slow server resolution, counters and loopback auth fixture |
| `web/scripts/test-dsa-navigation.mjs` | Reproducible production verification runner |
| `web/playwright.dsa-navigation.config.ts` | Production test servers and ordered measurement project |
| `web/package.json` | Verification script entry |
| `docs/dsa-navigation-before.json` | Original production-build navigation capture |
| `docs/dsa-navigation-after.json` | Final production-build navigation capture |
| `docs/dsa-navigation-public-baseline.json` | Read-only public API observations |
| `docs/dsa-navigation-remediation.md` | Engineering report |

## Remaining limits

Cold taxonomy reads still need the upstream service. Cursor pages intentionally remain sequential, and full board editing waits until the complete catalog is known. Next's 60-second taxonomy policy uses stale-while-revalidate: an existing name or canonical slug can briefly remain stale during revalidation, and upstream failures can retain prior public metadata. Newly added identifiers bypass a stale miss; problem visibility and preview permissions are still enforced by their authoritative APIs. No production database bottleneck or query improvement is claimed, and no production browser baseline was captured.
