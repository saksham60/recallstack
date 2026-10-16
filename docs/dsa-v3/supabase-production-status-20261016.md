# ReasonAI DSA V3 — Supabase production handoff and verification

Verified against production project `jlqawpdsyptfxspyqnsu` on 2026-10-16. This is a source-of-truth handoff to the Codex web workstream. No unapproved hidden-suite certificates were issued.

## Source-control reconciliation

- Foundation PR [#22](https://github.com/saksham60/recallstack/pull/22) was merged after confirming its nine DSA schema/data migrations were already present in the production migration ledger. **Do not reapply those migrations by hand.**
- Follow-up production migration `20261016110623_dsa_company_editorial_suffix_aliases` adds deterministic mappings only for pre-approved company aliases after stripping the source editorial suffix `Interview Qs`/`IQ`. Original source JSON/text is unchanged. This change is idempotent for already-mapped records.
- Existing production migrations also include `20261016080708_dsa_every_problem_practice_submissions` and `20261016081159_dsa_practice_submission_publication_rls_fix` (merged in PR #23). Preserve those semantics: practice submissions are *ungraded browser-example attempts*, never official Accepted.

## Production baseline

| Item | Verified value |
|---|---:|
| Published v2 DSA versions | 375 |
| Trusted current hidden-Submit certificates | 10 |
| Remaining versions needing real-judge certification | 365 |
| Canonical approved company tags | 56 |
| Company associations | 653 |
| Unique problems with approved company tags | 283 |
| Legacy raw company source records | 367 |
| Still requiring manual company-string review | 84 |
| Explorer board rows (new accounts need to create boards) | 0 |
| Code Intelligence report records | 1, queued |
| Durable ungraded practice submission records | 0 |

Company coverage was 254 problems / 587 relations before this suffix-only enrichment; 29 additional problems and 66 links were safely matched. Remaining strings may be whitespace-only mixes, misspellings, unknown companies or ambiguous source content; they should be reviewed, not silently parsed into associations.

## Existing production schema / endpoint dependencies

- `public.dsa_companies`, `public.dsa_company_aliases`, `public.dsa_problem_company_sources`, `public.dsa_problem_companies`: approved read-only company metadata. The web explorer must query the normalized associations, **not** assume every legacy raw company string is safely searchable.
- `public.dsa_explorer_boards`, `public.dsa_explorer_lanes`, `public.dsa_explorer_cards`, `public.dsa_explorer_view_state`, `public.dsa_explorer_mutations`: authenticated per-user boards and drag-drop ordering; revision-checked, idempotent mutation RPCs `public.dsa_explorer_move_card` and `public.dsa_explorer_reorder_lanes`. UI must handle `REVISION_CONFLICT`, ownership and stale-write errors.
- `public.dsa_practice_submissions`: allows authenticated owner INSERT and SELECT for a published current problem version, with server-side daily quota. Browser example feedback is untrusted and does **not** affect mastered progress or official acceptance. This is not a substitute for `dsa_execution_private.jobs`.
- `dsa_execution_private.certificates`, `dsa_execution_private.certification_checks`, `dsa_execution_private.certification_reviews`: private trusted execution readiness. Do not expose these tables or hidden fixture payloads in the browser.
- `public.dsa_code_intelligence_reports` and `public.dsa_learner_skill_signals`: authenticated read-own reports/signals, service-side generation and judge-evidence write path. Deduplicate reports per normalized code and verdict, plus model/rubric/contract/suite revision as the implementation evolves. Reports must not override the judge verdict.
- Existing trusted execution API is `POST /api/dsa/executions`, backed by `public.dsa_execution_command` and the private job schema. Coordinate with Codex rather than replacing it with a second official-judging endpoint.

## Critical outstanding certification work

**Only 10 versions are officially eligible for hidden-test judging.** The remaining 365 imported problem suites remain `needs_review` with pending fixture validation. Do not represent `dsa_practice_submissions` as a passed official Submit. Do not mark all pending fixtures `verified`, approve all suites, or create certificates solely to unlock buttons.

1. For each v2 problem, audit source statement, canonical entrypoint/adapter, reference solution and applicable checker archetype (standard return, mutation, design class, nodes, predicate/unordered/float).
2. Verify public + hidden fixtures independently against a reference oracle and contract; remove overlaps, duplicates and invalid expectations in versioned suites while preserving original audit rows.
3. Run deterministic Python harness tests locally. Run a bounded number of *real* Nebius operations against representative archetypes within the user's **five-call cumulative paid verification limit**.
4. Store individual certification evidence and approve private certificates only after the relevant checks succeed. Report 375/375 only when every version has genuine evidence.

**3Sum pilot:** The v2 problem version is `62b831b6-4c58-438e-9442-a78be83e3469`. A newer candidate suite `c34f14dd-3de2-4199-bf8f-67d0db67f9fb` has 36 pending cases and is still `needs_review`; it is *not* official judge-ready. The imported predecessor suite also remains unapproved. A separate independent oracle review and a representative live hosted smoke are needed before certification.

## Security observation requiring a separate decision

Supabase security advisor reports **39 pre-existing public tables with RLS disabled** (including the legacy user notes, bookmarks and progress tables). This is critical legacy exposure, but applying a blanket `ENABLE ROW LEVEL SECURITY` without replacing the existing backend access contracts could break the application. **Do not auto-run the advisor remediation.** Perform a separate, application-specific RLS policy review and staged rollout. New DSA V3 tables checked in this audit have RLS enabled, and private execution tables remain private. Advisory: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public .

## Web workstream acceptance checklist

- Show real topic/category counts, tags and saved personal ordering; handle conflict/refresh/denied-operation feedback.
- Keep ungraded practice attempt history distinct from real `dsa_execution_private.jobs` and `Accepted` status.
- Use the canonical problem version and fixture revision for local-Run success receipts.
- Confirm a real authenticated 3Sum correct and public-pass-hidden-fail submission through Vercel Queues and Nebius after its suite is certified; record operation/job IDs, timelines and actual persisted verdicts.
- Show deterministic verdict before asynchronous Code Intelligence, with report status, retries and accurate evidence.
- Preserve the existing mastery calculation. Never treat ungraded practice submission as mastery.
- Production database migrations are already applied; **do not re-run the source-control files outside migration ledger**.

## Verification queries

```sql
select count(*) from public.dsa_problem_versions where version_number=2;
select count(*) from dsa_execution_private.certificates
 where revoked_at is null and hidden_submit_approved;
select count(distinct definition_id) from public.dsa_problem_companies;
select count(*) from public.dsa_problem_company_sources
 where review_status='needs_review';
select status,count(*) from public.dsa_test_suites group by status;
select generation_status,count(*) from public.dsa_code_intelligence_reports
 group by generation_status;
```

Do not add a migration to repair old RLS or grant blanket access to judge tables without its own security review.
