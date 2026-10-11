# ReasonAI — Hackathon Evidence Hub

> **Status: First live capture completed on 2026-10-11 UTC; Issue #14 remains incomplete.** Source code and tests are inspectable implementation, not proof of a successful production run.

**Project:** [ReasonAI](https://www.reasonai.tech) · [3-minute demonstration](https://www.youtube.com/watch?v=FoV2KkK72Xs) · [Devpost](https://devpost.com/software/reasonai) · [Judge walkthrough](../../README.md#judge-quickstart--try-it-in-five-minutes) · [Full architecture](../ARCHITECTURE.md).

## Real screenshots — October 11, 2026

These are **actual Chromium captures of the production application**, collected by Codex. They were previously committed as PNG files, but not embedded in this page. Screenshots establish what was visible in the tested sessions; see the associated run records for observed events, limitations, and provenance.

### Live collaboration — verified UI synchronization

| Initial diagram in browser A | Same room synchronized in browser B |
| --- | --- |
| ![Before collaboration: initial messaging diagram with three nodes and two connections](screenshots/2026-10-11/collab-before-a.png) | ![Browser B receives a new node and connection from browser A](screenshots/2026-10-11/collab-sync-b.png) |

| Browser A receives the node move from B | Browser B after reconnecting |
| --- | --- |
| ![Updated live system design canvas in browser A with note moved by collaborator B](screenshots/2026-10-11/collab-move-synced-a.png) | ![Browser B after page reload retains the synchronized diagram](screenshots/2026-10-11/collab-reconnect-b.png) |

**Observed:** four nodes and three connections converged across two browser contexts, including after reloading browser B. This does not prove distributed scaling, ACK protocol metrics, or AI-driven edits. [Full collaboration run](runs/2026-10-11/COLLAB-01/record.md).

### Other real product screens

| Judge entry screen — login passed | DSA 3Sum tutor — hint appeared |
| --- | --- |
| ![ReasonAI login page with Continue as Hackathon Judge button](screenshots/2026-10-11/judge-login-before.png) | ![ReasonAI DSA workspace and an AI-generated hint for 3Sum](screenshots/2026-10-11/dsa-hint.png) |

| DSA visual walkthrough — renders, but accuracy failed | Knowledge Feed — story cards displayed |
| --- | --- |
| ![ReasonAI DSA array visual walkthrough, a schema-valid render whose generated reasoning contained mathematical errors](screenshots/2026-10-11/dsa-visual.png) | ![ReasonAI Knowledge Feed engineering story cards and Ask ReasonAI entry points](screenshots/2026-10-11/knowledge-story.png) |

**Limitations:** The DSA visual tool rendered but its generated explanation included an invalid zero-sum triplet. Knowledge Feed displayed stories but did not generate a completed research answer in the recorded runs. [DSA run](runs/2026-10-11/DSA-01/record.md) · [Feed run](runs/2026-10-11/KNOW-01/record.md).

### Captured failures — not presented as success

| System Design AI proposal request failed | Knowledge research answer failed |
| --- | --- |
| ![ReasonAI System Design panel displaying a failure instead of a proposed architecture change](screenshots/2026-10-11/system-design-proposal.png) | ![ReasonAI Knowledge story conversation displaying an incomplete-response failure](screenshots/2026-10-11/knowledge-research.png) |

These pictures show **failure handling**, not completed AI proposals or grounded research. [System Design run](runs/2026-10-11/SD-01/record.md) · [Feed run](runs/2026-10-11/KNOW-01/record.md).

## Evidence coverage

| Area | Inspectable implementation | Observed result and remaining gap |
| --- | --- | --- |
| **Judge access** | [Judge walkthrough](../../README.md#judge-quickstart--try-it-in-five-minutes) | [Fresh production browser sign-in passed](runs/2026-10-11/JUDGE-01/record.md). |
| **Sponsor integration** | [Nebius/Nemotron runtime map](../../HACKATHON_SUBMISSION.md), [System Design agent details](../../web/docs/system-design-reasonai.md) | [Direct local Nemotron Super and Tavily probes](runs/2026-10-11/provider-probe.json) returned HTTP 200. These are not app workflow evidence. Production provider/model ID remains unverified. |
| **System Design AI** | [Typed proposals and recovery](../../web/docs/reasonai-proposal-recovery.md), [browser tests](../../web/e2e/reasonai.spec.ts) | [Two live product requests failed](runs/2026-10-11/SD-01/record.md) before proposal generation. The seed canvas remained unchanged; acceptance and discard are unverified. |
| **DSA tutoring** | [DSA workspace](../../web/docs/dsa-workspace.md), [agent tests](../../web/e2e/dsa-reasonai-agent.spec.ts) | [Live 3Sum hint and schema-valid visuals](runs/2026-10-11/DSA-01/record.md) captured. Visual content quality failed: one skipped a pointer state, another named an invalid triplet. Production model ID was not surfaced. |
| **Knowledge Feed** | [Pipeline](../../backend/docs/knowledge-shorts.md), [API tests](../../backend/tests/knowledge/test_api.py) | [Three live app requests failed](runs/2026-10-11/KNOW-01/record.md). Browser capture showed no tool events or completed answer. Separately inspected production Vercel logs **did** record successful server-side `search_web` executions, but the final answer failed and no user-visible citation was produced; a sanitized server-side trace is not yet published. |
| **Realtime collaboration** | [Go service](../../realtime/README.md), [room tests](../../realtime/internal/room/room_test.go) | [Two-session UI convergence and reconnect](runs/2026-10-11/COLLAB-01/record.md) observed with a new node, connection, and node move. Protocol ACK IDs and production topology were not captured. |
| **Tracing / observability** | [LangSmith integration tests](../../web/e2e/langsmith.spec.ts) | [Mocked tracing tests passed](runs/2026-10-11/TESTS.md). No **sanitized live LangSmith trace artifact** was captured. Production Vercel logs show `langsmith.flush.completed` for these requests, which alone does not prove the relevant spans are retrievable. SD app trace IDs are recorded separately. |
| **Automated verification** | [Documented commands](../DEVELOPMENT.md#verification) | [Scoped results](runs/2026-10-11/TESTS.md): 166 web state tests, 46 backend tests, and typecheck passed. Browser suite server gate timed out; Go was not installed. |
| **User impact** | [Product demonstration](https://www.youtube.com/watch?v=FoV2KkK72Xs) | No consented user task study or measured impact. |

## 2026-10-11 capture summary

The production judge flow worked in a fresh browser. DSA generated real tool and visual events, but its trace content failed quality checks. Two-client collaboration produced converged screenshots. System Design returned `PROVIDER_FAILURE` on a retry; Knowledge research executed server-side web searches according to Vercel logs but returned `INCOMPLETE_RESPONSE` instead of a completed cited answer. These failures and missing LangSmith provenance are included in the records. The [test report](runs/2026-10-11/TESTS.md) labels fixture-based results separately from live tasks.

## Capture and reporting rules

1. Follow the [capture runbook](CAPTURE_RUNBOOK.md), [fixed evaluation protocol](EVALUATION_PROTOCOL.md), and [run record template](RUN_RECORD_TEMPLATE.md). Do not generate mock screenshots as evidence.
2. Store reviewed records under `docs/evidence/runs/YYYY-MM-DD/<case-id>/` and screenshots under `docs/evidence/screenshots/`.
3. Label live model calls, unit/E2E tests, direct provider probes, and subjective scoring separately. Include failures and all attempts.
4. Report latency, cost, throughput, win rate, or accuracy only with a measurement source and sample size. The messaging prompt is an architecture exercise, not a million-user load test.
5. Keep credentials, cookies, private rooms, identifying data, and private model reasoning out of public artifacts. Record only sanitized excerpts and public source URLs.

**Next evidence milestone:** resolve the live System Design and Knowledge failures, capture proposal acceptance/discard and source-backed research, and obtain sanitized production model and LangSmith provenance.
