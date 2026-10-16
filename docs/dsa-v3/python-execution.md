# Shared Python execution

`runner_harness.py` is the authoritative source. `npm run dsa:harness` normalizes
line endings and packages identical bytes for Pyodide and the Nebius supervisor.
`npm run dsa:harness:check` fails on drift; commit both generated artifacts.

Approved contracts are validated by `python-contract.ts`. Legacy single/args/
kwargs calls remain supported. Adapter `reasonai-python:1` supports typed function
and Solution method calls, mutation selection, returned-prefix selection, design
operation registries, arrays, level-order trees, adjacency graphs and indexed node
tables for identity/cycles. No checker or expected output enters the Python harness.
Unsupported contracts fail closed. Typed templates require approved metadata;
titles and statement examples are never used to guess a typed contract.

The server derives a bounded complete public bundle from its certified Run plan.
Its revision covers certificate, suite, contract, cases and harness SHA. The browser
checks matching IDs/hash, runs every case, and binds its UX receipt to account,
problem/version, exact source SHA, contract and fixture revision. Any code edit or
cancelled/failed rerun revokes eligibility. The server independently judges Submit
through the existing endpoint; no browser receipt is trusted by the judge.

Each local case has a fresh Worker/interpreter (3-second execution budget), with
60-second initialization and 120-second overall limits. An idle prewarmed Worker
has never executed learner code. CSP allows pinned runtime asset downloads but
blocks authenticated first-party fetch and nested workers. Custom inputs and
statement examples remain explicitly provisional. Local Run sends no execution POST.

The Nebius supervisor consumes the same harness source in a fresh unprivileged
process per case, retaining existing process/resource, output and global budgets.
Expected values and exact/unordered/numeric/fixed-predicate comparison remain in
the trusted TypeScript judge. The new wrapper has compilation and source-parity
evidence. A real canonical 3Sum component operation passed all 36 actual fixtures;
see `artifacts/dsa-v3-live-component.json`. Authenticated API/Queue/persisted result
and report proof remains a release gate; component evidence does not satisfy it.

Real browser suite: `npx playwright test e2e/dsa-python-real.spec.ts --workers=1`.
It mirrors Pyodide 0.28.3 from the pinned dev dependency, executes actual Python
and uses fixture public API data. CPython suite:
`cd backend && uv run pytest tests/dsa/test_python_harness.py -q`.
Execution unit suite: `cd web && npm run test:executions` (live opt-ins remain off).
For supervisor compilation set `DSA_TEST_PYTHON` if the backend virtualenv is absent.

Production SQL currently admits at most 20 public cases and only the three
original checker mappings. It denies unsupported suites rather than evaluating
a partial page. Expanding those bounds/checker mappings requires reviewed SQL
and independently recertified exact contracts. Existing certificate flags are
not sufficient evidence for V3 certification.
The pending V3 registry migration expands supported complete plans to 100 cases
and fixed predicates, tied to approved exact contract/fixture/harness digests.
