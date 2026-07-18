# Ultimate DSA workbook import

## Source and safety

`data/DS Algo/Ultimate DSA.xlsx` is input data and remains ignored by Git. The command is dry-run by
default. Apply mode requires `--apply` and an active admin `--actor-profile-id`; identity is never read
from workbook cells. Import writes use the same admin content application service as online authoring.
Each content workflow operation is transactional and the batch is resumable after a row-level failure.

## Approved mapping

- All 375 problem rows are preserved. `Index` becomes part of the deterministic slug
  `ultimate-dsa-NNN-<title>`, so repeated titles are not silently merged.
- The category cell maps to one direct DSA category assignment. The 16 accepted category names map to
  the slugs maintained by the seed command.
- Difficulty is read from the approved category-cell fill legend: easy, medium, or hard.
- The problem hyperlink becomes one primary practice resource. Hostnames map to LeetCode,
  GeeksForGeeks, InterviewBit, SPOJ, HackerRank, HackerEarth, or CP Algorithms.
- The one legacy GeeksForGeeks HTTP URL is normalized to HTTPS. Other non-HTTPS or unknown-provider
  URLs fail validation.
- Title becomes the published-version title. A short generated summary and one immutable `recognize`
  block retain dataset name, source index/row, category, URL, and available companies/remarks.
- The workbook does not define detailed topics, so no topic or primary-topic assignment is invented.
- Personal Done/Attempted tracking columns are ignored; user learning state is never imported.
- A SHA-256 fingerprint of authoritative source fields makes unchanged reruns no-ops. Repeated titles
  and normalized URLs remain in the report for later editorial cleanup.

The seed command idempotently maintains the seven required active practice providers. Provider IDs
remain PostgreSQL `SMALLINT` values resolved by slug at runtime; no ID is hard-coded in import data.

## Runbook

```powershell
uv run python -m recallstack.commands.seed
uv run python -m recallstack.commands.import_dsa_workbook "..\data\DS Algo\Ultimate DSA.xlsx" --report .\dsa-import-report.json
uv run python -m recallstack.commands.import_dsa_workbook "..\data\DS Algo\Ultimate DSA.xlsx" --apply --actor-profile-id PROFILE_UUID --report .\dsa-import-applied.json
```

Dry-run still reads the configured database to classify rows and verify seeded references, but does not
write. Apply reports failures per source index and returns a nonzero exit code if any row fails. Fix the
reported cause and rerun; published fingerprints and stable slugs prevent duplicates, while incomplete
draft/in-review rows are resumed.

## Rollback

The importer never hard-deletes content. For an operational rollback, retain the applied JSON report,
identify content items by the `ultimate-dsa-` slug prefix, and archive them through the authorized
admin archive workflow. Archiving preserves versions, immutable blocks, resources, publication audit
history, and catalog change history. Do not delete rows directly. If the entire import ran only in a
disposable environment, rebuilding that environment from Alembic migrations remains the clean option.
