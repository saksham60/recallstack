# DSA V3 checkpoint log

## 2026-10-16 — started

- Branch: codex/dsa-v3. Baseline: 11e6a7a.
- User authorized implementation after review. Desktop web only; no mobile edits.
- Supabase owner will supply handoff; reviewed content/metadata also pending.
- Max five combined paid Nebius/AI verification calls, retries included; used 0.
- Preserve existing mastery semantics independently of Accepted.
- Checkpoint 1 in progress: inventory, canonical routes, topic home/boards,
  personal layouts contract, legacy migration and browser regression.
- Checkpoints 2–4 pending. Do not label 375/375 or production-ready without evidence.

## Checkpoint 1 — implementation and local verification

- Topic-first dashboard with canonical counts/progress, topic search and local
  account/version-scoped resume link; three-lane boards, composable filters,
  pointer/keyboard ordering, collections, optimistic saves and conflict rollback.
- Canonical workspace, server-resolved legacy links, UUID/category mappings,
  source attribution, practice tracking, notes, bookmarks, tutor and drafts retained.
- Proposed migration and exact API handoff prepared. Production board/company
  persistence integration remains pending the separate owner's review/application.
- Backend: Ruff and mypy passed; 42 API + 14 PostgreSQL integration tests passed.
- Existing execution lifecycle/judge/context unit checks: 15 passed (no provider).
- Full browser regression: 180 passed, one existing opt-in real API check skipped.
  Fixtures test UI/contracts, not real production Supabase persistence or grading.
- Desktop screenshots inspected and copied to ignored local directory
  `web/.next/cache/dsa-v3-checkpoint-1/`; narrow-browser/overflow checks passed.
- Initial cold dev compile/resource contention and missing manual realtime test
  configuration were corrected before the clean full browser run. Old screen
  tests were migrated to canonical equivalents rather than disabled.
- Production read-only inventory saved for all 375 IDs; existing certificates 10,
  suites needing review 365. Canonical 3Sum is published but uncertified.
- Production build passed with TypeScript and route generation. No production
  migration/deployment. Paid calls 0/5.
