# ReasonAI — Nebius × NVIDIA hackathon evidence pack

**Track:** Best Apps & Agents · **Evidence status:** Initial audit only; new live and user-study benchmarks **not run** as of 2026-10-11.  
**Product:** https://www.reasonai.tech · **Submission context:** [HACKATHON_SUBMISSION.md](../../HACKATHON_SUBMISSION.md)

This is the public verification appendix for ReasonAI, not a marketing scorecard. It distinguishes *source-documented implementation*, *historical test evidence*, *live production verification*, and *impact measured with people*. Absence of measured results is reported as **pending**, never silently converted into success.

## Nebius judging rubric (four equal 25% criteria)

The official [rules](https://nebiusglobalaihackathon.devpost.com/rules) use Stage 1 pass/fail for technical viability, then evaluate **Technological Implementation**, **Design**, **Potential Impact**, and **Quality of the Idea** equally (1–5 each). Judges may decide on text, visuals and video without launching the app.

| Criterion | What ReasonAI can demonstrate | Evidence required before a numerical claim |
| --- | --- | --- |
| Technological Implementation | Real Nebius Token Factory / Nemotron inference, bounded LangGraph tools, model routing, safe canvas proposals, Go collaboration | Deployed Nebius request IDs / redacted traces, reproducible live workflow results, failure/latency counts |
| Design | Feed → architecture review/collaboration → DSA learning, plus Flutter surfaces | Unedited task recordings, task success/assistance/time, clear before/after UI states |
| Potential Impact | Technical learners and engineers can discover, reason, design and practice | Predefined rubric, matched before/after or controlled-task comparison, participant denominators and counterexamples |
| Quality of Idea | Connected technical judgment workflow rather than isolated chat tools | Specific user pain, alternatives, system boundaries and why Nebius-powered tools are essential |

**Eligibility blocker to verify:** at least one real runtime request to Nebius Token Factory (or actual Nebius AI Cloud compute) with an NVIDIA open-source model, plus a working judge-accessible application. A mocked test or model identifier in source code does not prove this.

## Evidence already in source (not a fresh production benchmark)

| Source | Narrowly supported finding | Important limitation |
| --- | --- | --- |
| [System Design technical verification](../../web/docs/system-design-reasonai.md) | Historical 2026-09-14 report: 240 state/provider tests and 49 browser tests; a later documented run reports 214 state/provider and 63 browser tests, plus live configuration checks of research/visual-analysis paths | These are separate historical test configurations and **must not be added**. This evidence does not prove the Oct. 2026 production deployment works. |
| [LangSmith tracing implementation](../../web/src/lib/reasonai/server/langsmith.ts) and [tracing tests](../../web/e2e/langsmith.spec.ts) | Code supports server-side model/tool tracing with credential redaction; tests use stubbed responses | Stubbed tests do not establish that current requests reach Nebius or that production traces are complete. |
| [Realtime service](../../realtime/README.md) and [metrics](../../realtime/internal/metrics/metrics.go) | Go service documents operation sequencing, replay, reconnect and Prometheus metrics | Rooms are single-instance, memory-only; no current two-user reliability benchmark is published. |
| [Knowledge Feed verification](../../backend/docs/knowledge-shorts-verification.md) | Historical 2026-09-26 report: 164 backend tests passed, 45 skipped, plus 5 PostgreSQL contract checks | Report explicitly stated real 5-story provider/R2 run was incomplete *at that date*. Do not extrapolate to current production. |
| [Architecture and judge path](../../README.md) | Public MIT repository documents web, mobile, feed, DSA, system design and judge mode | Documentation is not substitute for independent usability or live acceptance tests. |

**Known historical caveat:** the Knowledge verification note also recorded a failed dependency vulnerability audit. Re-run and resolve security audits before treating that historical build as production-cleared.

## New evidence collection — status

| ID | Evaluation | Planned size | Status | Source file |
| --- | --- | ---: | --- | --- |
| DSA | Tutoring outcome and explanation quality | 10 selected tasks | **Pending** | [TEST_CASES.md](TEST_CASES.md) |
| SD | Architecture quality before/after AI review | 5 tasks | **Pending** | [METHODOLOGY.md](METHODOLOGY.md) |
| FEED | Claim/source grounding and usefulness | 20 selected stories | **Pending** | [TEST_CASES.md](TEST_CASES.md) |
| RT | Two-client sync and reconnect | 20 scenarios | **Pending** | [TEST_CASES.md](TEST_CASES.md) |
| AGENT | Live Nemotron tool/response success | 30 prompts | **Pending** | [TEST_CASES.md](TEST_CASES.md) |
| UX | Unassisted discoverability of key journeys | 5–8 consenting participants | **Pending** | [METHODOLOGY.md](METHODOLOGY.md) |

See [METHODOLOGY.md](METHODOLOGY.md) for measurement definitions, baselines and reviewer procedure; [TEST_CASES.md](TEST_CASES.md) for the fixed case plan; [results/README.md](results/README.md) and [results/results-template.csv](results/results-template.csv) for the raw-data schema. [DEVPOST_COPY.md](DEVPOST_COPY.md) contains submission-safe copy.

## Reproduction / collection procedure

1. Freeze a git SHA and build/deploy revision. Record the date, environment and anonymized participant/test IDs.
2. Run existing code checks (for web, scripts declared in [web/package.json](../../web/package.json): `npm run verify` from `web/`, with required local dependencies/config). Report exact test totals **from this run**, not historical reports.
3. Execute the fixed cases on the actual judge-accessible deployment. Distinguish `automated_mock`, `automated_live`, and `human` for every result.
4. Export redacted LangSmith/Nebius request evidence, review failures, and enter one row per attempted case in [results/results-template.csv](results/results-template.csv). Never publish credentials, user content or raw identifiers.
5. Publish counts with denominators, score rubrics, deployment SHA, run date, and any exclusions or missing values. Keep all failures visible.
6. Only then replace **Pending** labels and insert actual measured findings into [DEVPOST_COPY.md](DEVPOST_COPY.md), the Devpost page and the demo narration.

**We do not currently claim** higher student learning outcomes, a percent accuracy, production uptime, an average response speed, or benchmark superiority.
