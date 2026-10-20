# ReasonAI — Nebius × NVIDIA hackathon evidence pack

**Track:** Best Apps & Agents · **Engineering evidence:** implementation records, dated production tests and documented limitations.  
**Product:** https://www.reasonai.tech · **Submission context:** [HACKATHON_SUBMISSION.md](../../HACKATHON_SUBMISSION.md)

This appendix links implementation records and dated production verification for ReasonAI. Historical automated tests and live production journeys are identified separately; neither is presented as a controlled user-impact or performance benchmark.

## Dated evidence addendum — October 20, 2026

The original engineering audit was recorded October 11. The repository contains [later October 17 live DSA production verification](../dsa-v3/integration-20261017.md): the published 375-problem catalog exposed Run and Submit for every problem, including **10 legacy officially certified** and **365 provisionally graded** versions. Real authenticated 3Sum and Catalan Number journeys produced saved judge verdicts and Nebius/Nemotron Code Intelligence documents. A provisional `provisional_pass` is explicitly **not** official `Accepted`; these two runs do not establish a 375-problem sandbox pass rate.

Flutter v1.0.0 (2) has a [debug-signed APK handoff](../../mobile/docs/release-readiness.md#verified-debug-delivery); a publicly accessible distribution URL and production-signed release remain unverified. Earlier Knowledge/System Design results and limitations retain their original observation dates.

## Nebius judging rubric (four equal 25% criteria)

The official [rules](https://nebiusglobalaihackathon.devpost.com/rules) use Stage 1 pass/fail for technical viability, then evaluate **Technological Implementation**, **Design**, **Potential Impact**, and **Quality of the Idea** equally (1–5 each). Judges may decide on text, visuals and video without launching the app.

| Criterion | What ReasonAI can demonstrate | Evidence required before a numerical claim |
| --- | --- | --- |
| Technological Implementation | Real Nebius Token Factory / Nemotron inference, bounded LangGraph tools, model routing, safe canvas proposals, Go collaboration | Deployed Nebius request IDs / redacted traces, reproducible live workflow results, failure/latency counts |
| Design | Feed → architecture review/collaboration → DSA learning, plus Flutter surfaces | Unedited task recordings, task success/assistance/time, clear before/after UI states |
| Potential Impact | Technical learners and engineers can discover, reason, design and practice | Predefined rubric, matched before/after or controlled-task comparison, participant denominators and counterexamples |
| Quality of Idea | Connected technical judgment workflow rather than isolated chat tools | Specific user pain, alternatives, system boundaries and why Nebius-powered tools are essential |

**Recorded sponsor evidence:** [October 17 production DSA verification](../dsa-v3/integration-20261017.md) documents two actual sandbox submissions and two saved NVIDIA Nemotron Super Code Intelligence reports. The [October 11 evidence hub](../evidence/INDEX.md) separately records provider probes and a System Design model/tool run. See those dated records for exact scope and limitations.

## Evidence already in source (not a fresh production benchmark)

| Source | Narrowly supported finding | Important limitation |
| --- | --- | --- |
| [System Design technical verification](../../web/docs/system-design-reasonai.md) | Historical 2026-09-14 report: 240 state/provider tests and 49 browser tests; a later documented run reports 214 state/provider and 63 browser tests, plus live configuration checks of research/visual-analysis paths | These are separate historical test configurations and **must not be added**. This evidence does not prove the Oct. 2026 production deployment works. |
| [LangSmith tracing implementation](../../web/src/lib/reasonai/server/langsmith.ts) and [tracing tests](../../web/e2e/langsmith.spec.ts) | Code supports server-side model/tool tracing with credential redaction; tests use stubbed responses | Stubbed tests do not establish that current requests reach Nebius or that production traces are complete. |
| [Realtime service](../../realtime/README.md) and [metrics](../../realtime/internal/metrics/metrics.go) | Go service documents operation sequencing, replay, reconnect and Prometheus metrics | Rooms are single-instance, memory-only; no current two-user reliability benchmark is published. |
| [Knowledge Feed verification](../../backend/docs/knowledge-shorts-verification.md) | Historical 2026-09-26 report: 164 backend tests passed, 45 skipped, plus 5 PostgreSQL contract checks | Report explicitly stated real 5-story provider/R2 run was incomplete *at that date*. Do not extrapolate to current production. |
| [Architecture and judge path](../../README.md) | Public MIT repository documents web, mobile, feed, DSA, system design and judge mode | Documentation is not substitute for independent usability or live acceptance tests. |

**Known historical caveat:** the Knowledge verification note also recorded a failed dependency vulnerability audit. Re-run and resolve security audits before treating that historical build as production-cleared.

## Verification references

- [Production DSA integration and persisted results](../dsa-v3/integration-20261017.md)
- [Dated System Design, Feed, DSA and collaboration evidence](../evidence/INDEX.md)
- [Reproducible local development and verification commands](../DEVELOPMENT.md)
- [Mobile build, signature and device verification](../../mobile/docs/release-readiness.md)

Claims about learning outcomes, system-wide latency, production uptime, or scalability require independent measurements. Documentation and automated tests alone do not establish those outcomes.

**We do not currently claim** higher student learning outcomes, a percent accuracy, production uptime, an average response speed, or benchmark superiority.
