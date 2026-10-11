# ReasonAI — Hackathon Evidence Hub

> **Status: First live capture completed on 2026-10-11 UTC; Issue #14 remains incomplete.** Source code and tests are inspectable implementation, not proof of a successful production run.

**Project:** [ReasonAI](https://www.reasonai.tech) · [3-minute demonstration](https://www.youtube.com/watch?v=FoV2KkK72Xs) · [Devpost](https://devpost.com/software/reasonai) · [Judge walkthrough](../../README.md#judge-quickstart--try-it-in-five-minutes) · [Full architecture](../ARCHITECTURE.md).

## Evidence coverage

| Area | Inspectable implementation | Observed result and remaining gap |
| --- | --- | --- |
| **Judge access** | [Judge walkthrough](../../README.md#judge-quickstart--try-it-in-five-minutes) | [Fresh production browser sign-in passed](runs/2026-10-11/JUDGE-01/record.md). |
| **Sponsor integration** | [Nebius/Nemotron runtime map](../../HACKATHON_SUBMISSION.md), [System Design agent details](../../web/docs/system-design-reasonai.md) | [Direct local Nemotron Super and Tavily probes](runs/2026-10-11/provider-probe.json) returned HTTP 200. These are not app workflow evidence. Production provider/model ID remains unverified. |
| **System Design AI** | [Typed proposals and recovery](../../web/docs/reasonai-proposal-recovery.md), [browser tests](../../web/e2e/reasonai.spec.ts) | [Two live product requests failed](runs/2026-10-11/SD-01/record.md) before proposal generation. The seed canvas remained unchanged; acceptance and discard are unverified. |
| **DSA tutoring** | [DSA workspace](../../web/docs/dsa-workspace.md), [agent tests](../../web/e2e/dsa-reasonai-agent.spec.ts) | [Live 3Sum hint and schema-valid visuals](runs/2026-10-11/DSA-01/record.md) captured. Visual content quality failed: one skipped a pointer state, another named an invalid triplet. Production model ID was not surfaced. |
| **Knowledge Feed** | [Pipeline](../../backend/docs/knowledge-shorts.md), [API tests](../../backend/tests/knowledge/test_api.py) | [Three live app requests failed](runs/2026-10-11/KNOW-01/record.md). No app-level Tavily tool call, citation, or completed Nemotron answer was observed. |
| **Realtime collaboration** | [Go service](../../realtime/README.md), [room tests](../../realtime/internal/room/room_test.go) | [Two-session UI convergence and reconnect](runs/2026-10-11/COLLAB-01/record.md) observed with a new node, connection, and node move. Protocol ACK IDs and production topology were not captured. |
| **Tracing / observability** | [LangSmith integration tests](../../web/e2e/langsmith.spec.ts) | [Mocked tracing tests passed](runs/2026-10-11/TESTS.md). No live LangSmith key or trace was available. SD app trace IDs are recorded separately. |
| **Automated verification** | [Documented commands](../DEVELOPMENT.md#verification) | [Scoped results](runs/2026-10-11/TESTS.md): 166 web state tests, 46 backend tests, and typecheck passed. Browser suite server gate timed out; Go was not installed. |
| **User impact** | [Product demonstration](https://www.youtube.com/watch?v=FoV2KkK72Xs) | No consented user task study or measured impact. |

## 2026-10-11 capture summary

The production judge flow worked in a fresh browser. DSA generated real tool and visual events, but its trace content failed quality checks. Two-client collaboration produced converged screenshots. System Design returned `PROVIDER_FAILURE` on a retry; Knowledge research returned `INCOMPLETE_RESPONSE` on retries. These failures and missing LangSmith provenance are included in the records. The [test report](runs/2026-10-11/TESTS.md) labels fixture-based results separately from live tasks.

## Capture and reporting rules

1. Follow the [capture runbook](CAPTURE_RUNBOOK.md), [fixed evaluation protocol](EVALUATION_PROTOCOL.md), and [run record template](RUN_RECORD_TEMPLATE.md). Do not generate mock screenshots as evidence.
2. Store reviewed records under `docs/evidence/runs/YYYY-MM-DD/<case-id>/` and screenshots under `docs/evidence/screenshots/`.
3. Label live model calls, unit/E2E tests, direct provider probes, and subjective scoring separately. Include failures and all attempts.
4. Report latency, cost, throughput, win rate, or accuracy only with a measurement source and sample size. The messaging prompt is an architecture exercise, not a million-user load test.
5. Keep credentials, cookies, private rooms, identifying data, and private model reasoning out of public artifacts. Record only sanitized excerpts and public source URLs.

**Next evidence milestone:** resolve the live System Design and Knowledge failures, capture proposal acceptance/discard and source-backed research, and obtain sanitized production model and LangSmith provenance.
