# Catalog certification tooling

Run from `web/` with Node 22 and locked dependencies. The entry command is
`npm run dsa:certify -- <options>`. No command here changes production data,
approves fixtures, inserts certificates or calls a paid provider.

```sh
npm run dsa:certify -- --audit --dry-run
npm run dsa:certify -- --audit --dry-run --imported-directory .next/cache/dsa-v3-private --evidence-directory ../artifacts
npm run dsa:certify -- --problem 3sum --reviewed-bundle /secure/reviewed-bundle.json --batch-size 1
npm run dsa:certify -- --cohort source-review --reviewed-bundle /secure/reviewed-bundle.json --batch-size 20 --resume ../artifacts/dsa-certification-manifest.json
npm run dsa:certify -- --ids <uuid>,<uuid> --reviewed-bundle /secure/reviewed-bundle.json --batch-size 2
npm run dsa:certify -- --audit --dry-run --strict
```

`--inventory` selects another immutable identity snapshot. Cohorts are source-review,
checker-archetype and final. Batch size is 1..25 (default 10); ID selections must
resolve completely. `--output` selects a manifest path. A companion failures JSON
contains exact blocked IDs and reasons. Strict release gating returns nonzero
while any required certification remains absent, including genuine provider/owner
approval. Ordinary audits return success when the audit itself completes, even
when every row is blocked. Read aggregate counts, not only the process exit code.

The default inventory has all 375 current identities. Optional imported-directory
files are private read-only exports named catalog-000.json through catalog-350.json
(25 rows each), with actual specifications, provenance, active certificate contract
and complete inline fixtures. These stay under ignored storage, never in a public
artifact. Export current version/latest-suite pointers, and reject stale identities
rather than silently auditing a different suite. Current audit reads 11,591 real
fixture rows; it does not infer success from old publication/provenance flags.

Reviewed bundle schema is executable in `scripts/dsa-certification/core.ts`:
schemaVersion 1 and items with exact problem/version/suite, source URL/hash/reviewer
evidence, approved typed contract, two or three independently authored reference
sources, public/hidden fixtures with review/category, and positive plus adversarial
checker-review cases. Do not fabricate reviewer identities or claim that generated
candidate metadata is editorial approval. Existing private imports are the starting
point for review; another user-provided document is not required.

Checks cover immutable identities, statement publication, adapter schema, typed
template invocation, public/hidden presence, duplicates, overlap, conflicting
expectations, JSON/input/output bounds, boundary/stress coverage, positive/negative
checker behavior and actual reference agreement. Real Python executes in disposable
sandboxed Chromium Workers with pinned offline Pyodide assets, a fresh interpreter
per case, 3-second case termination and a 120-second problem budget. No user profile,
credentials, arbitrary network access or host Python execution is given to references.
Private expectations stay in the controller; Workers receive only source and input.

Each completed problem is checkpointed atomically. Resume retains completed local
results only for matching problem/version/suite, full input hash and harness SHA,
then selects the next unfinished batch. It never turns a resumed row into certified.
All public evidence contains hashes, case IDs/status/counts and timings, never
reference source or hidden input/output. Saved 3Sum local/provider evidence is
attached only when fixture, source, harness and complete case coverage match.

Current manifest: 375 fixture audits, one independent 3Sum oracle validation and
one genuine Nebius compatibility component, **zero V3-certified problems**.
The source/typed approval, pending fixture transitions and real authenticated
Submit/report journey remain explicit gates. Existing 10 legacy certificates are
not relabelled as V3 certification. Formal owner approval must reference exact
registry/fixture/harness digests in the proposed ledger before eligibility changes.

The canonical 3Sum local proof can be reproduced with a private read-only export:

```sh
npx tsx scripts/verify-three-sum.ts --input .next/cache/dsa-v3-private/three-sum-source.json
```

It runs imported and independent multiplicity oracles against the actual 36 cases,
checks an actual public-pass/hidden-fail candidate, and adds two 3,000-element stress
inputs. Its authored-variant source caveat remains unresolved approval work.
Live component checks require explicit `DSA_V3_LIVE_COMPONENT=1`, use a persisted
five-call budget reservation before the only non-retried launch, and retain exact
operation/source/fixture/harness evidence. Do not enable broad legacy live suites:
**one live call is used, four remain for submission/report verification**.
